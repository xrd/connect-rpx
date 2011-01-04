var sys = require('sys');
var http = require('http');
var qs = require('querystring');

// Connect Middleware for integrating RPX Now into your application
var RPX_HOST = 'rpxnow.com';
var RPX_LOGIN_ROOT = "/api/v2/auth_info";
var RPX_LOGIN_URL = "https://rpxnow.com/api/v2/auth_info";

var options = {
    callback_path : '/login_completed',
    logout_path : '/logout',
    host : 'localhost',
    port : '80',
    connect_session : 'connect.session',
    name : 'default',
    onSuccesfulLogin :  function( json, req, res, next ) {
        sys.puts( "In default login" );
        req.sessionStore.regenerate(req, function(err){
            req.session.username = json.profile.displayName;
        });
        redirect( res, '/' );
    }

};

function redirect(res,location) {
    res.writeHead( 302, {
        'Location': location
    });
    res.end();
}

function isAuthenticated(req) {
    return req && req.session && req.session.username;
}

function getCredentials(req,res,next) {
    var token = req.body.token;
    postWithCredentials( token, req, res, next );
}

var rpxResponseBody = '';
function postWithCredentials( token, req, res, next ) {
    var apiKey = options['apiKey'];
    var toPost = qs.stringify( { token : token, apiKey : apiKey } );
    var toPostHeader = { 'Host'           : RPX_HOST,
                         'Content-Type'   : 'application/x-www-form-urlencoded',
                         'Content-Length' : toPost.length };
    var postRequest = http.createClient( 443, RPX_HOST, true ).request( 'POST', RPX_LOGIN_ROOT, toPostHeader );
    postRequest.write( toPost, 'utf8' );
    postRequest.on( 'response', function(rpxResponse) {
	    rpxResponse.on( 'data', chunkRpxResponse );
	    rpxResponse.on( 'end', function() { onCredentialsReceived( rpxResponseBody, req, res, next ) } );
	    rpxResponse.on( 'error', onError );
    });
    postRequest.end();
}

function chunkRpxResponse( chunk ) {
    rpxResponseBody += chunk;
}

function onError(response) {
    sys.puts( "Something bad happened" );
}

function onCredentialsReceived(data, req, res, next) {
    var json;
    if( data ) {
	try {
	    json = JSON.parse( data );
	}
	catch( e ) {
	    sys.puts( "E: " + sys.inspect( e ) );
	}
    }
    if( json && 'ok' == json.stat ) {
        options.onSuccessfulLogin( json, req, res, next );
    }
    else {
        redirect( res, options.loginPage );
    }
}

function initialize() {
}

function shouldFakeIt() {
    return options.fakedAuthentication;
}

function fakeIt(req,res,next) {
    sys.puts( "Hey, we are here!" );
    var json = { 'profile' : { 'displayName' :  ('fakedUsername' + parseInt( Math.random() * 1000 ) ) } }
    options.wtf( json, req, res, next );
    next();
}

exports.config = function( key, value ) {
    if( value ) {
        // sys.puts( "Setting: " + key );
        options[key] = value;
    }
    return options[key];
}

exports.test_rpx = function( token, apiKey ) {
    options['apiKey'] = apiKey;
    post_with_credentials( token );
}

exports.handler = function() {
    return function(req,res,next) {
        sys.puts( "Inside RPX" );
        if( req.url == options.reentryPoint ) {
            getCredentials(req,res,next);
        }
        else if( req.url == options.loginPage ) {
            next();
        }
        else if( req.url == options.logoutPoint ) {
            req.sessionStore.regenerate(req, function(err){
                req.session.username = undefined;
                redirect( res, options.loginPage );
            });
        }
        else {
            if( isAuthenticated(req) ) {
                next();        
            }
            else if( shouldFakeIt() ) {
                fakeIt(req,res,next);
            }
            else  {
                ignored = false;
                ignore = options.ignorePaths;
                for( x in ignore ) { 
                    var first = req.url.substr( 0, ignore[x].length );
                    var second = ignore[x];
                    // sys.puts( "Ignoring: " + ignore[x] + " vs. " + req.url + " vs. " + first );
                    if( first == second ) { // req.url.substr( 0, ignore[x].length ) == ignore[x] ) {
                        ignored = true;
                        next();
                    }
                }
                
                if( !ignored ) {
                    // If we got here, then send to login page
                    redirect( res, options.loginPage );
                }
            }
        }
        // sys.puts( "Nothing happened, we got here" );
        //next();
        //req.end();
    };
}
    
