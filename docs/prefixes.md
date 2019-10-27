# <a name="prefixes"></a>Monitored Prefixes List

## <a name="generate"></a>Auto-generate prefixes list

To auto generate the monitored prefixes file (by default called `prefixes.yml`) execute:
* If you are using the binary `./bgpalerter-linux-x64 generate -a ASN(S) -o OUTPUT_FILE` (e.g. `./bgpalerter-linux-x64 generate -a 2914 -o prefixes.yml`).
* If you are using the source code `npm run generate-prefixes -- --a ASN(S) --o OUTPUT_FILE` (e.g. `npm run generate-prefixes -- --a 2914 --o prefixes.yml`).

The script will detect whatever is currently announced by the provided AS and will take this as "the expected status".

A warning will be triggered in case of not valid RPKI prefixes, anyway, you should always check the generated list, especially if you are using the option `-i` 

Below the list of possible parameters. **Remember to prepend them with a `--` instead of `-` if you are using the source code version.**

| Parameter | Description  | Expected format | Example  |  Required |
|---|---|---|---|---|
| -o  | The YAML output file | A string ending in ".yml" | prefixes.yml | Yes |
| -a  | The AS number(s) you want to generate the list for  | A comma-separated list of integers  | 2914,3333  | No (one among -a, -p, -pf is required) |
| -e  | Prefixes to exclude from the list | A comma-separated list of prefixes | 165.254.255.0/24,192.147.168.0/24 | No |
| -i  | Avoid monitoring delegated prefixes. If a more specific prefix is found and it results announced by an AS different from the one declared in -a, then set `ignore: true` and `ignoreMorespecifics: true` | Nothing | | No
| -p  | Prefixes for which the list will be generated | A comma-separated list of prefixes | 165.254.255.0/24,192.147.168.0/24 | No (one among -a, -p, -pf is required) |
| -pf  | A file containing the prefixes for which the list will be generated | A text file having a prefix for each line | prefixes.txt | No (one among -a, -p, -pf is required) |


## <a name="prefixes-fields"></a>Prefixes list fields

The prefix list is a file containing a series of blocks like the one below, one for each prefix to monitor.

>Tip: Only the attributes description, asn, and ignoreMorespecifics are mandatory.

```
165.254.255.0/24:
  description: Rome peering
  asn: 2914
  ignoreMorespecifics: false
  ignore: false,
  group: aUserGroup
  excludeMonitors:
    - withdrawal-detection
  path:
    match: ".*2194,1234$"
    notMatch: ".*5054.*"
    matchDescription: detected scrubbing center
    maxLength: 128
    minLength: 2
    
```

###### <a name="array"></a>
> Tip: In yml, arrays of values are described with dashes, like below:
```
asn:
- 2914
- 3333 
```

Below the complete list of attributes (the dot notation is used to represent yml sub-dictionaries):

| Attribute | Description | Expected type | Required |
|---|---|---|---|
| asn | The expected origin AS(es) of the prefix | An integer or an array of integers. | Yes | 
| description | A description that will be reported in the alerts | A string | Yes |
| ignoreMorespecifics | Prefixes more specific of the current one will be excluded from monitoring | A boolean | Yes |
| ignore | Exclude the current prefix from monitoring. Useful when you are monitoring a prefix and you want to exclude a particular sub-prefix| A boolean | No |
| includeMonitors | The list of monitors you want to run on this prefix. If this attribute is not declared, all monitors will be used. Not compatible with excludeMonitors. | An array of strings (monitors name according to config.yml) | No |
| excludeMonitors | The list of monitors you want to exclude on this prefix. Not compatible with includeMonitors. | An array of strings (monitors name according to config.yml) | No |
| path | A dictionary containing all sub-attributes for path matching. All the sub-attributes are in AND.| Sub-attributes (as follows) | No |
| path.match | The regular expression that will be tested on each AS path. If the expression tests positive the BGP message triggers an alert. ASns are comma separated (see example above). **Please, use optimized regular expression as described [in the following sub-section](#optimized-regular-expressions-for-as-path-matching)** | A string (valid RegEx) | No |
| path.notMatch | The regular expression that will be tested on each AS path. If the expression tests positive the BGP message will not triggers an alert. ASns are comma separated (see example above). | A string (valid RegEx) | No |
| path.matchDescription | The description that will be reported in the alert in case the regex test results in a match. | A string | No |
| path.maxLength | The maximum length allowed for an AS path. Longer paths will trigger an alert. | A number | No |
| path.minLength | The minimum length allowed for an AS path. Shorter paths will trigger an alert. | A number | No |
| group | The name of the group that will receive alerts about this monitored prefix. By default all alerts are sent to the "default" group. | A string | No |



### Optimized regular expressions for AS path matching

The following simple regular expressions will drastically reduce CPU and network usage when applied to the `path.match` attribute. Instead, there are no benefits in applying the following regular expressions to the `path.notMatch` attribute.

To drastically optimize the process, try to use one of the following regular expression for `path.match` attribute. If the obtained filter is too loose, add additional (complex) constraints in `path.notMatch`. In this way the more complex `path.notMatch` will be tested only on the subset produced by the faster `path.match`.

* "789$" - match paths that originate with AS789
* "456" - match any path that traverses AS456 at any point
* "^123,456" - match paths where the last traversed ASNs were 123 and 456 (in that order)
* "^123,456,789$" - match the exact path [123, 457, 789]
* "[789,101112]" - match paths containing the AS_SET {789, 101112}
