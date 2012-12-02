pm.helpers = {
    activeHelper: "normal",

    init:function () {
        $("#request-types .request-helper-tabs li").on("click", function () {
            $("#request-types .request-helper-tabs li").removeClass("active");
            $(this).addClass("active");
            var type = $(this).attr('data-id');
            pm.helpers.showRequestHelper(type);
        });

        $('.request-helper-submit').on("click", function () {
            var type = $(this).attr('data-type');
            $('#request-helpers').css("display", "none");
            pm.helpers.processRequestHelper(type);
        });


    },

    processRequestHelper:function (type) {
        if (type === 'basic') {
            this.basic.process();
        }
        else if (type === 'oAuth1') {
            this.oAuth1.process();
        }
        return false;
    },

    showRequestHelper:function (type) {
        pm.helpers.activeHelper = type.toLowerCase();
        $("#request-types ul li").removeClass("active");
        $('#request-types ul li[data-id=' + type + ']').addClass('active');
        if (type !== "normal") {
            $('#request-helpers').css("display", "block");
        }
        else {
            $('#request-helpers').css("display", "none");
        }

        if (type.toLowerCase() === 'oauth1') {
            this.oAuth1.generateHelper();
        }

        $('.request-helpers').css("display", "none");
        $('#request-helper-' + type).css("display", "block");
        return false;
    },

    basic:{
        process:function () {
            var headers = pm.request.headers;
            var authHeaderKey = "Authorization";
            var pos = findPosition(headers, "key", authHeaderKey);

            var username = $('#request-helper-basicAuth-username').val();
            var password = $('#request-helper-basicAuth-password').val();

            username = pm.envManager.convertString(username);
            password = pm.envManager.convertString(password);

            var rawString = username + ":" + password;
            var encodedString = "Basic " + btoa(rawString);

            if (pos >= 0) {
                headers[pos] = {
                    key:authHeaderKey,
                    name:authHeaderKey,
                    value:encodedString
                };
            }
            else {
                headers.push({key:authHeaderKey, name:authHeaderKey, value:encodedString});
            }

            pm.request.headers = headers;
            $('#headers-keyvaleditor').keyvalueeditor('reset', headers);
            pm.request.openHeaderEditor();
        }
    },

    oAuth1:{
        generateHelper:function () {
            $('#request-helper-oauth1-timestamp').val(OAuth.timestamp());
            $('#request-helper-oauth1-nonce').val(OAuth.nonce(6));
        },

        generateSignature:function () {
            //Make sure the URL is urlencoded properly
            //Set the URL keyval editor as well. Other get params disappear when you click on URL params again
            if ($('#url').val() === '') {
                $('#request-helpers').css("display", "block");
                alert('Please enter the URL first.');
                return null;
            }

            var processedUrl = pm.envManager.convertString($('#url').val()).trim();
            processedUrl = ensureProperUrl(processedUrl);

            if (processedUrl.indexOf('?') > 0) {
                processedUrl = processedUrl.split("?")[0];
            }

            var message = {
                action:processedUrl,
                method:pm.request.method,
                parameters:[]
            };

            //all the fields defined by oauth
            $('input.signatureParam').each(function () {
                if ($(this).val() != '') {
                    var val = $(this).val();
                    val = pm.envManager.convertString(val);
                    message.parameters.push([$(this).attr('key'), val]);
                }
            });

            //Get parameters
            var urlParams = $('#url-keyvaleditor').keyvalueeditor('getValues');
            var bodyParams = [];

            if (pm.request.isMethodWithBody(pm.request.method)) {
                if (pm.request.body.mode == "params") {
                    bodyParams = $('#formdata-keyvaleditor').keyvalueeditor('getValues');
                }
                else if (pm.request.body.mode == "urlencoded") {
                    bodyParams = $('#urlencoded-keyvaleditor').keyvalueeditor('getValues');
                }
            }


            var params = urlParams.concat(bodyParams);

            for (var i = 0; i < params.length; i++) {
                var param = params[i];
                if (param.key) {
                    param.value = pm.envManager.convertString(param.value);
                    message.parameters.push([param.key, param.value]);
                }
            }

            var accessor = {};
            if ($('input[key="oauth_consumer_secret"]').val() != '') {
                accessor.consumerSecret = $('input[key="oauth_consumer_secret"]').val();
                accessor.consumerSecret = pm.envManager.convertString(accessor.consumerSecret);
            }
            if ($('input[key="oauth_token_secret"]').val() != '') {
                accessor.tokenSecret = $('input[key="oauth_token_secret"]').val();
                accessor.tokenSecret = pm.envManager.convertString(accessor.tokenSecret);
            }

            return OAuth.SignatureMethod.sign(message, accessor);
        },

        removeOAuthKeys:function (params) {
            var i, count;
            var oauthParams = [
                "oauth_token",
                "oauth_signature_method",
                "oauth_timestamp",
                "oauth_nonce",
                "oauth_version",
                "oauth_signature"
            ];

            var newParams = [];
            var oauthIndexes = [];
            for (i = 0, count = params.length; i < count; i++) {
                var index = _.indexOf(oauthParams, params[i].key);
                if (index < 0) {
                    newParams.push(params[i]);
                }
            }

            return newParams;
        },

        process:function () {
            var i, count, length;
            var params = [];
            var urlParams = pm.request.getUrlEditorParams();
            var bodyParams = [];

            if (pm.request.body.mode === "params") {
                bodyParams = $('#formdata-keyvaleditor').keyvalueeditor('getValues');
            }
            else if (pm.request.body.mode === "urlencoded") {
                bodyParams = $('#urlencoded-keyvaleditor').keyvalueeditor('getValues');
            }

            params = params.concat(urlParams);
            params = params.concat(bodyParams);

            params = pm.helpers.oAuth1.removeOAuthKeys(params);
            var signatureKey = "oauth_signature";

            $('input.signatureParam').each(function () {
                if ($(this).val() != '') {
                    var val = $(this).val();
                    params.push({key:$(this).attr('key'), value:val});
                }
            });

            //Convert environment values
            for (i = 0, length = params.length; i < length; i++) {
                params[i].value = pm.envManager.convertString(params[i].value);
            }

            var signature = this.generateSignature();

            if (signature == null) {
                return;
            }

            params.push({key:signatureKey, value:signature});

            var addToHeader = $('#request-helper-oauth1-header').attr('checked') ? true : false;

            if (addToHeader) {
                var realm = pm.envManager.convertString($('#url').val()).trim();
                if (realm.indexOf('?') > 0) {
                    realm = realm.split("?")[0];
                }
                var headers = pm.request.headers;
                var authHeaderKey = "Authorization";
                var pos = findPosition(headers, "key", authHeaderKey);

                var rawString = "OAuth realm=\"" + realm + "\",";
                var len = params.length;
                for (i = 0; i < len; i++) {
                    rawString += encodeURIComponent(params[i].key) + "=\"" + encodeURIComponent(params[i].value) + "\",";
                }
                rawString = rawString.substring(0, rawString.length - 1);

                if (pos >= 0) {
                    headers[pos] = {
                        key:authHeaderKey,
                        name:authHeaderKey,
                        value:rawString
                    };
                }
                else {
                    headers.push({key:authHeaderKey, name:authHeaderKey, value:rawString});
                }

                pm.request.headers = headers;
                $('#headers-keyvaleditor').keyvalueeditor('reset', headers);
                pm.request.openHeaderEditor();
            } else {
                if (pm.request.method === "GET") {
                    $('#url-keyvaleditor').keyvalueeditor('reset', params);
                    pm.request.setUrlParamString(params);
                    pm.request.openUrlEditor();
                } else {
                    var dataMode = pm.request.body.getDataMode();
                    if (dataMode === 'urlencoded') {
                        $('#urlencoded-keyvaleditor').keyvalueeditor('reset', params);
                    }
                    else if (dataMode === 'params') {
                        $('#formdata-keyvaleditor').keyvalueeditor('reset', params);
                    }
                }
            }
        }
    }
};