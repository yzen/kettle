/**
 * Kettle Requests.
 *
 * Copyright 2012-2013 OCAD University
 *
 * Licensed under the New BSD license. You may not use this file except in
 * compliance with this License.
 *
 * You may obtain a copy of the License at
 * https://github.com/gpii/kettle/LICENSE.txt
 */

(function () {

    "use strict";

    var fluid = require("infusion"),
        uuid = require("node-uuid"),
        kettle = fluid.registerNamespace("kettle");

    fluid.defaults("kettle.requests.io", {
        gradeNames: ["autoInit", "fluid.littleComponent"],
        invokers: {
            createIO: {
                funcName: "kettle.requests.createIO",
                args: ["{that}", "{arguments}.0"]
            }
        }
    });

    /**
     * Create a lifecycle object that will serve as a context
     * for a current socket.io request/response sequence.
     */
    kettle.requests.createIO = function (that, socket) {
        var name = uuid.v4();
        that.options.components[name] = {
            type: "kettle.requests.request.io",
            options: {
                socket: socket,
                members: {
                    name: name
                }
            }
        };
        fluid.initDependent(that, name);
        var request = that[name];

        socket.on("disconnect", function () {
            if (that[name]) {
                request.events.onRequestEnd.fire();
                request.destroy();
            }
        });

        // Adding a request object to socket.io's socket.
        socket.fluidRequest = request;
    };

    /**
     * Socket.io request/response sequence object.
     */
    fluid.defaults("kettle.requests.request.io", {
        gradeNames: ["autoInit", "kettle.requests.request"],
        mergePolicy: {
            "socket": "noexpand, nomerge"
        },
        members: {
            socket: "{that}.options.socket"
        },
        listeners: {
            onError: [
                "{that}.events.onRequestEnd.fire",
                "{that}.destroy"
            ],
            onSuccess: [
                "{that}.events.onRequestEnd.fire",
                "{that}.destroy"
            ]
        },
        invokers: {
            onErrorHandler: {
                funcName: "kettle.requests.request.io.onErrorHandler",
                args: ["{that}.send", "{arguments}.0"]
            },
            onSuccessHandler: {
                funcName: "kettle.requests.request.io.onSuccessHandler",
                args: ["{that}.send", "{arguments}.0"]
            }
        }
    });

    /**
     * Send an error message to the client if the error event is fired.
     * @param  {Function} send a response.send function.
     * @param  {Object}   response an error message.
     */
    kettle.requests.request.io.onErrorHandler = function (send, error) {
        if (!send) {
            return;
        }
        error = error || {
            isError: true,
            message: "Unknown error"
        };
        send(error);
    };

    /**
     * Send a successful message to the client if the success event is fired.
     * @param  {Function} send a response.send function.
     * @param  {Object} response a success message.
     */
    kettle.requests.request.io.onSuccessHandler = function (send, response) {
        if (!send) {
            return;
        }
        send(response);
    };

})();