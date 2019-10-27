import axios from "axios";
import brembo from "brembo";
import yaml from "js-yaml";
import fs from "fs";
const batchPromises = require('batch-promises');

module.exports = function generatePrefixes(asnList, outputFile, exclude, excludeDelegated, prefixes) {
    const generateList = {};
    let someNotValidatedPrefixes = false;

    if (!asnList && !prefixes) {
        throw new Error("You need to specify at least an AS number or a list of prefixes.");
    }

    if (asnList && prefixes) {
        throw new Error("You can specify an AS number or a list of prefixes, not both.");
    }

    if (!outputFile) {
        throw new Error("Output file not specified");
    }

    const getMultipleOrigins = (prefix) => {
        const url = brembo.build("https://stat.ripe.net", {
            path: ["data", "prefix-overview", "data.json"],
            params: {
                resource: prefix
            }
        });

        return axios({
            url,
            method: 'GET',
            responseType: 'json'
        })
            .then(data => {
                let asns = [];
                if (data.data && data.data.data && data.data.data.asns){
                    asns = data.data.data.asns.map(i => i.asn);
                }

                return asns;
            })
    };

    const getAnnouncedMoreSpecifics = (prefix) => {
        const url = brembo.build("https://stat.ripe.net", {
            path: ["data", "related-prefixes", "data.json"],
            params: {
                resource: prefix
            }
        });

        return axios({
            url,
            method: 'GET',
            responseType: 'json'
        })
            .then(data => {
                let prefixes = [];
                if (data.data && data.data.data && data.data.data.prefixes){
                    prefixes = data.data.data.prefixes
                        .filter(i => i.relationship === "Overlap - More Specific")
                        .map(i => {
                            return {
                                asn: i.origin_asn,
                                description: i.asn_name,
                                prefix: i.prefix
                            }
                        });
                }

                return prefixes;
            })

    };

    const generateRule = (prefix, asn, ignoreMorespecifics, description, excludeDelegated) =>
        getMultipleOrigins(prefix)
            .then(asns => {
                const origin = (asns && asns.length) ? asns : [asn];

                generateList[prefix] = {
                    description: description || "No description provided",
                    asn: origin.map(i => parseInt(i)),
                    ignoreMorespecifics: ignoreMorespecifics,
                    ignore: excludeDelegated
                };
            });

    const getAnnouncedPrefixes = (asn) => {
        const url = brembo.build("https://stat.ripe.net", {
            path: ["data", "announced-prefixes", "data.json"],
            params: {
                resource: asn
            }
        });

        return axios({
            url,
            method: 'GET',
            responseType: 'json'
        })
            .then(data => {
                if (data.data && data.data.data && data.data.data.prefixes) {
                    return data.data.data.prefixes
                        .filter(item => {
                            const latest = item.timelines
                                .map(t => (t.endtime) ? new Date(t.endtime) : new Date())
                                .sort((a,b) => a-b)
                                .pop();

                            return latest.getTime() + (3600 * 24 * 1000) > new Date().getTime();
                        })

                }
                return [];
            })
            .then(list => list.filter(i => !exclude.includes(i.prefix)))
            .then(list => {
                return Promise.all(list.map(i => generateRule(i.prefix, asn, false, null, false)))
                    .then(() => list.map(i => i.prefix))
            })

    };

    const validatePrefix = (asn, prefix) => {
        const url = brembo.build("https://stat.ripe.net", {
            path: ["data", "rpki-validation", "data.json"],
            params: {
                resource: asn,
                prefix
            }
        });

        return axios({
            url,
            method: 'GET',
            responseType: 'json'
        })
            .then(data => {
                if (data.data && data.data.data && data.data.data.validating_roas) {
                    return data.data.data.validating_roas.map(i => i.validity).some(i => i === 'valid');
                }
                return false;
            })
            .then((isValid) => {
                if (isValid) {
                    generateList[prefix].description += ' (valid ROA available)';
                } else {
                    someNotValidatedPrefixes = true;
                }
            })
    };

    const getBaseRules = () => {
        if (prefixes) {
            return Promise
                .all(prefixes.map(p => generateRule(p, null, false, null, false)))
                .then(() => prefixes);
        } else {
            return Promise.all(asnList.map(getAnnouncedPrefixes));
        }
    };

    return getBaseRules()
        .then(items => [].concat.apply([], items))
        .then(prefixes => {
            return batchPromises(20, prefixes, prefix => {
                return getAnnouncedMoreSpecifics(prefix)
                    .then((items) => Promise
                        .all(items.map(item => generateRule(item.prefix, item.asn, true, item.description, excludeDelegated))))
                    .catch((e) => {
                        console.log("Cannot download more specific prefixes of", prefix, e);
                    })
            })
                .catch((e) => {
                    console.log("Cannot download more specific prefixes", e);
                })
        })
        .then(() => {
            return Promise.all(Object.keys(generateList).map(prefix => validatePrefix(generateList[prefix].asn[0], prefix)))
                .catch((e) => {
                    console.log("ROA check failed due to error", e);
                })
        })
        .then(() => {
            const yamlContent = yaml.dump(generateList);
            fs.writeFileSync(outputFile, yamlContent);

            if (someNotValidatedPrefixes) {
                console.log("WARNING: The generated configuration is a snapshot of what is currently announced. Some of the prefixes don't have ROA objects associated or are RPKI invalid. Please, verify the config file by hand!");
            }
            console.log("Done!");
        })
        .catch((e) => {
            console.log("Something went wrong", e);
        })

};
