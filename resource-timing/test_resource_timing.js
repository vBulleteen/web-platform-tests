var TEST_ALLOWED_TIMING_DELTA = 20;

var waitTimer;
var expectedEntries = {};

var initiatorTypes = ["iframe", "img", "link", "script", "xmlhttprequest"];

var tests = {};
setup(function() {
    for (var i in initiatorTypes) {
        var type = initiatorTypes[i];
        tests[type] = {
            "entry": async_test("window.performance.getEntriesByName() and window.performance.getEntriesByNameType() return same data (" + type + ")"),
            "simple_attrs": async_test("PerformanceEntry has correct name, initiatorType, startTime, and duration (" + type + ")"),
            "timing_attrs": async_test("PerformanceEntry has correct order of timing attributes (" + type + ")"),
            "network_attrs": async_test("PerformanceEntry has correct network transfer attributes (" + type + ")")
        };
    }
});

function resolve(path) {
    var a = document.createElement("a");
    a.href = path;
    return a.href;
}

onload = function()
{
    // check that the Performance Timeline API exists
    test(function() {
        assert_idl_attribute(window.performance, "getEntriesByName",
                             "window.performance.getEntriesByName() is defined");
    });
    test(function() {
        assert_idl_attribute(window.performance, "getEntriesByType",
                             "window.performance.getEntriesByType() is defined");
    });
    test(function() {
        assert_idl_attribute(window.performance, "getEntries",
                             "window.performance.getEntries() is defined");
    });

    var expected_entry;
    var url;
    var type;
    var startTime;
    var element;
    var transferSize;
    var encodedBodySize;
    var decodedBodySize;
    for (var i in initiatorTypes) {
        startTime = window.performance.now();
        type = initiatorTypes[i];
        if (type != "xmlhttprequest") {
            element = document.createElement(type);
        } else {
            element = null;
        }
        switch (type) {
        case "iframe":
            url = resolve("resources/resource_timing_test0.html");
            element.src = url;
            transferSize = 352;
            encodedBodySize = 215;
            decodedBodySize = 215;
            break;
        case "img":
            url = resolve("resources/resource_timing_test0.png");
            element.src = url;
            transferSize = 386;
            encodedBodySize = 249;
            decodedBodySize = 249;
            break;
        case "link":
            element.rel = "stylesheet";
            url = resolve("resources/resource_timing_test0.css");
            element.href = url;
            transferSize = 179;
            encodedBodySize = 44;
            decodedBodySize = 44;
            break;
        case "script":
            element.type = "text/javascript";
            url = resolve("resources/resource_timing_test0.js");
            element.src = url;
            transferSize = 276;
            encodedBodySize = 133;
            decodedBodySize = 133;
            break;
        case "xmlhttprequest":
            var xmlhttp = new XMLHttpRequest();
            url = resolve("resources/gzip_xml.py");
            xmlhttp.open('GET', url, true);
            xmlhttp.send();
            transferSize = 274;
            encodedBodySize = 112;
            decodedBodySize = 125;
            break;
        }

        expected_entry = {name:url,
                          startTime: startTime,
                          initiatorType: type,
                          transferSize: transferSize,
                          encodedBodySize: encodedBodySize,
                          decodedBodySize: decodedBodySize
                         };

        switch (type) {
        case "link":
            poll_for_stylesheet_load(expected_entry);
            document.body.appendChild(element);
            break;
        case "xmlhttprequest":
            xmlhttp.onload = (function(entry) {
                return function (event) {
                    resource_load(entry);
                };
            })(expected_entry);
            break;
        default:
            element.onload = (function(entry) {
                return function (event) {
                    resource_load(entry);
                };
            })(expected_entry);
            document.body.appendChild(element);
        }

    }
};

function poll_for_stylesheet_load(expected_entry) {
    var t = tests[expected_entry.initiatorType];

    function inner() {
        for(var i=0; i<document.styleSheets.length; i++) {
            var sheet = document.styleSheets[i];
            if (sheet.href === expected_entry.name) {
                try {
                    // try/catch avoids throwing if sheet object exists before it is loaded,
                    // which is a bug, but not what we are trying to test here.
                    var hasRules = sheet.cssRules.length > 0;
                } catch(e) {
                    hasRules = false;
                }
                if (hasRules) {
                    t["entry"].step_timeout(function() {
                        resource_load(expected_entry);
                    }, 200);
                    return;
                }
            }
        }
        t["entry"].step_timeout(inner, 100);
    }
    inner();
}

function resource_load(expected)
{
    var t = tests[expected.initiatorType];

    t["entry"].step(function() {
        var entries_by_name = window.performance.getEntriesByName(expected.name);
        assert_equals(entries_by_name.length, 1, "should have a single entry for each resource (without type)");
        var entries_by_name_type = window.performance.getEntriesByName(expected.name, "resource");
        assert_equals(entries_by_name_type.length, 1, "should have a single entry for each resource (with type)");
        assert_not_equals(entries_by_name, entries_by_name_type, "values should be copies");
        for (p in entries_by_name[0]) {
            assert_equals(entries_by_name[0][p], entries_by_name_type[0][p], "Property " + p + " should match");
        }
        this.done();
    });

    t["simple_attrs"].step(function() {
        var actual = window.performance.getEntriesByName(expected.name)[0];
        var expected_type = expected.initiatorType;
        assert_equals(actual.name, expected.name);
        assert_equals(actual.initiatorType, expected_type);
        assert_equals(actual.entryType, "resource");
        assert_greater_than_equal(actual.startTime, expected.startTime, "startTime is after the script to initiate the load ran");
        assert_equals(actual.duration, (actual.responseEnd - actual.startTime));
        this.done();
    });

    t["timing_attrs"].step(function test() {
        var actual = window.performance.getEntriesByName(expected.name)[0];

        // Debugging bug 1263428
        // Feel free to remove/overwrite this piece of code
        if (actual.connectStart < actual.domainLookupEnd) {
            assert_true(false, "actual: "+JSON.stringify(actual));
        }

        assert_equals(actual.redirectStart, 0, "redirectStart time");
        assert_equals(actual.redirectEnd, 0, "redirectEnd time");
        assert_true(actual.secureConnectionStart == undefined ||
                    actual.secureConnectionStart == 0, "secureConnectionStart time");
        assert_equals(actual.fetchStart, actual.startTime, "fetchStart is equal to startTime");
        assert_greater_than_equal(actual.domainLookupStart, actual.fetchStart, "domainLookupStart after fetchStart");
        assert_greater_than_equal(actual.domainLookupEnd, actual.domainLookupStart, "domainLookupEnd after domainLookupStart");
        assert_greater_than_equal(actual.connectStart, actual.domainLookupEnd, "connectStart after domainLookupEnd");
        assert_greater_than_equal(actual.connectEnd, actual.connectStart, "connectEnd after connectStart");
        assert_greater_than_equal(actual.requestStart, actual.connectEnd, "requestStart after connectEnd");
        assert_greater_than_equal(actual.responseStart, actual.requestStart, "responseStart after requestStart");
        assert_greater_than_equal(actual.responseEnd, actual.responseStart, "responseEnd after responseStart");
        this.done();
    });

    t["network_attrs"].step(function test() {
        var actual = window.performance.getEntriesByName(expected.name)[0];
        assert_equals(actual.nextHopProtocol, "http/1.1", "expected protocol");
        assert_equals(actual.transferSize, expected.transferSize, "transferSize time");
        assert_equals(actual.encodedBodySize, expected.encodedBodySize, "encodedBodySize time");
        assert_equals(actual.decodedBodySize, expected.decodedBodySize, "decodedBodySize time");
        this.done();
    });

}
