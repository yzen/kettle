/**
 *
 * Kettle Tets Utils
 *
 * Copyright 2013 Raising the Floor International
 * Copyright 2013 OCAD University
 *
 * Licensed under the New BSD license. You may not use this file except in
 * compliance with this License.
 *
 * You may obtain a copy of the License at
 * https://github.com/gpii/universal/LICENSE.txt
 */

/*global require, __dirname*/

"use strict";

var fluid = require("infusion"),
    http = require("http"),
    path = require("path"),
    kettle = fluid.require(path.resolve(__dirname, "../../../kettle.js")),
    jqUnit = fluid.require("jqUnit");

fluid.setLogging(true);

fluid.registerNamespace("kettle.tests");

fluid.defaults("kettle.tests.cookieJar", {
    gradeNames: ["fluid.littleComponent", "autoInit"],
    members: {
        cookie: "",
        parser: {
            expander: {
                func: "kettle.tests.makeCookieParser",
                args: "{that}.options.secret"
            }
        }
    }
});

kettle.tests.makeCookieParser = function (secret) {
    return kettle.utils.cookieParser(secret);
};

fluid.defaults("kettle.tests.request", {
    gradeNames: ["fluid.eventedComponent", "autoInit"],
    invokers: {
        send: "kettle.tests.request.send"
    },
    events: {
        onComplete: null
    },
    requestOptions: {
        port: 8080
    },
    termMap: {}
});

// Definition and defaults of socket.io request component
fluid.defaults("kettle.tests.request.io", {
    gradeNames: ["autoInit", "kettle.tests.request"],
    invokers: {
        send: {
            funcName: "kettle.tests.request.io.send",
            args: [
                "{that}",
                "{arguments}.0",
                "{that}.events.onComplete.fire"
            ]
        },
        listen: {
            funcName: "kettle.tests.request.io.listen",
            args: "{that}"
        },
        connect: {
            funcName: "kettle.tests.request.io.connect",
            args: "{that}"
        },
        disconnect: {
            funcName: "kettle.tests.request.io.disconnect",
            args: "{that}.socket"
        },
        setCookie: {
            funcName: "kettle.tests.request.io.setCookie",
            args: ["{cookieJar}", "{arguments}.0"]
        },
        updateDependencies: {
            funcName: "kettle.tests.request.io.updateDependencies",
            args: "{that}"
        }
    },
    events: {
        onMessage: null,
        onError: null
    },
    listeners: {
        onCreate: "{that}.updateDependencies",
        "{tests}.events.onServerReady": {
            listener: "{that}.listen",
            priority: "first"
        },
        onDestroy: "{that}.disconnect"
    },
    listenOnInit: false,
    requestOptions: {
        hostname: "ws://localhost"
    },
    ioOptions: {
        transports: ["websocket"],
        "force new connection": true
    }
});

kettle.tests.request.io.disconnect = function (socket) {
    socket.disconnect();
};

kettle.tests.request.io.connect = function (that) {
    var options = fluid.copy(that.options.requestOptions);
    options.path = fluid.stringTemplate(options.path, that.options.termMap);
    var url = options.hostname + ":" + options.port + options.path;
    fluid.log("connecting to: " + url);
    // Create a socket.
    that.socket = that.io.connect(url, that.options.ioOptions);
    that.socket.on("error", that.events.onError.fire);
    that.socket.on("message", that.events.onMessage.fire);
};

kettle.tests.request.io.updateDependencies = function (that) {
    // Set io.
    that.io = require("socket.io-client");

    // Handle cookie
    // NOTE: version of xmlhttprequest that socket.io-client depends on does not
    // permit cookies to be set. The newer version has a setDisableHeaderCheck
    // method to permit restricted headers. This magic below is simply replacing
    // the socket.io-client's XMLHttpRequest object with the newer one.
    // See https://github.com/LearnBoost/socket.io-client/issues/344 for more
    // info.
    var newRequest = require("xmlhttprequest").XMLHttpRequest;
    require("socket.io-client/node_modules/xmlhttprequest").XMLHttpRequest =
        function () {
            newRequest.apply(this, arguments);
            this.setDisableHeaderCheck(true);
            var originalOpen = this.open;
            this.open = function() {
                originalOpen.apply(this, arguments);
                that.setCookie(this);
            };
        };
};

kettle.tests.request.io.listen = function (that) {
    if (that.options.listenOnInit) {
        that.connect();
    }
};

kettle.tests.request.io.setCookie = function (cookieJar, request) {
    if (cookieJar.cookie) {
        request.setRequestHeader("cookie", cookieJar.cookie);
    }
};

kettle.tests.request.io.send = function (that, model, callback) {
    if (!that.options.listenOnInit) {
        that.connect();
        that.socket.on("connect", function () {
            fluid.log("sending: " + JSON.stringify(model));
            that.socket.emit("message", model, callback);
        });
    } else {
        fluid.log("sending: " + JSON.stringify(model));
        that.socket.emit("message", model, callback);
    }
};

// Definition and defaults of http request component
fluid.defaults("kettle.tests.request.http", {
    gradeNames: ["autoInit", "kettle.tests.request"],
    invokers: {
        send: {
            funcName: "kettle.tests.request.http.send",
            args: [
                "{that}.options.requestOptions",
                "{that}.options.termMap",
                "{cookieJar}",
                "{that}.events.onComplete.fire",
                "{arguments}.0"
            ]
        }
    }
});

kettle.tests.request.http.send = function (requestOptions, termMap, cookieJar, callback, model) {
    var options = fluid.copy(requestOptions);
    options.path = fluid.stringTemplate(options.path, termMap);
    fluid.log("Sending a request to:", options.path || "/");
    options.headers = options.headers || {};
    if (model) {
        model = typeof model === "string" ? model : JSON.stringify(model);
        options.headers["Content-Type"] = "application/json";
        options.headers["Content-Length"] = model.length;
    }
    if (cookieJar.cookie) {
        options.headers.Cookie = cookieJar.cookie;
    }
    var req = http.request(options, function(res) {
        var data = "";
        res.setEncoding("utf8");

        res.on("data", function (chunk) {
            data += chunk;
        });

        res.on("close", function(err) {
            if (err) {
                jqUnit.assertFalse("Error making request to " + options.path +
                    ": " + err.message, true);
            }
        });

        res.on("end", function() {
            var cookie = res.headers["set-cookie"];
            var pseudoReq = {};
            if (cookie) {
                cookieJar.cookie = cookie;
                // Use connect's cookie parser with set secret to parse the
                // cookies from the kettle.server.
                pseudoReq = {
                    headers: {
                        cookie: cookie[0]
                    }
                };
                // pseudoReq will get its cookies and signedCookis fields
                // populated by the cookie parser.
                cookieJar.parser(pseudoReq, {}, fluid.identity);
            }
            callback(data, res.headers, pseudoReq.cookies,
                pseudoReq.signedCookies);
        });
    });

    req.shouldKeepAlive = false;

    req.on("error", function(err) {
        jqUnit.assertFalse("Error making request to " + options.path + ": " +
            err.message, true);
    });

    if (model) {
        req.write(model);
    }

    req.end();
};

// Component that contains the Kettle configuration under test.
fluid.defaults("kettle.tests.configuration", {
    gradeNames: ["autoInit", "fluid.eventedComponent", "{kettle.tests.testCaseHolder}.options.configurationName"],
    components: {
        server: {
            options: {
                listeners: {
                    onListen: "{kettle.tests.testCaseHolder}.events.onServerReady"
                }
            }
        }
    }
});

fluid.defaults("kettle.tests.testCaseHolder", {
    gradeNames: ["autoInit", "fluid.test.testCaseHolder"],
    events: {
        applyConfiguration: null,
        onServerReady: null
    },
    secret: "kettle tests secret",
    distributeOptions: [{
        source: "{that}.options.secret",
        target: "{that > cookieJar}.options.secret"
    }, {
        source: "{that}.options.secret",
        target: "{that server}.options.secret"
    }],
    components: {
        cookieJar: {
            type: "kettle.tests.cookieJar"
        },
        configuration: {
            type: "kettle.tests.configuration",
            createOnEvent: "applyConfiguration"
        }
    }
});

fluid.defaults("kettle.tests.testEnvironment", {
    gradeNames: ["fluid.test.testEnvironment", "autoInit"]
});

kettle.tests.moduleSource = function (testDef) {
    var sequence = fluid.copy(testDef.sequence);

    sequence.unshift({
        func: "{tests}.events.applyConfiguration.fire"
    }, {
        event: "{tests}.events.onServerReady",
        listener: "fluid.identity"
    });

    sequence.push({
        func: "{tests}.configuration.server.stop"
    }, {
        event: "{tests}.configuration.server.events.onStopped",
        listener: "fluid.identity"
    });

    return {
        name: testDef.configurationName + " tests.",
        tests: {
            name: testDef.name,
            expect: testDef.expect,
            sequence: sequence
        }
    };
};

kettle.tests.buildTestCase = function (configurationName, testDef) {
    testDef.configurationName = configurationName;
    testDef.moduleSource = {
        funcName: "kettle.tests.moduleSource",
        args: "{kettle.tests.testCaseHolder}.options"
    };
    return testDef;
};

kettle.tests.buildTests = function (testDefs) {
    return fluid.transform(testDefs, function (testDef) {
        var configurationName = kettle.config.createDefaults(testDef.config);
        var testName = fluid.model.composeSegments("kettle.tests",
            fluid.allocateGuid());
        fluid.defaults(testName, {
            gradeNames: ["kettle.tests.testEnvironment", "autoInit"],
            components: {
                tests: {
                    type: "kettle.tests.testCaseHolder",
                    options: kettle.tests.buildTestCase(configurationName,
                        testDef)
                }
            }
        });
        return testName;
    });
};


kettle.tests.runTests = function (testDefs) {
    var tests = kettle.tests.buildTests(testDefs);
    fluid.test.runTests(tests);
};

kettle.tests.bootstrap = function (testDefs) {
    return kettle.tests.allTests ? kettle.tests.buildTests(testDefs) :
        kettle.tests.runTests(testDefs);
};
