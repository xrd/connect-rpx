var sys = require('sys');
var fs = require('fs');
var https = require('https');
var qs = require('querystring');

// Connect Middleware for integrating RPX Now into your application
var RPX_HOST = 'rpxnow.com';
var RPX_LOGIN_ROOT = "/api/v2/auth_info";
//var RPX_LOGIN_URL = "/api/v2/auth_info";

var options = {
    callback_path : '/login_completed',
    logoutPoint : '/logout',
    host : 'localhost',
    port : '80',
    connect_session : 'connect.session',
    name : 'default',
    onSuccesfulLogin :  function( json, req, res, next ) {
        // sys.puts( "In default login" );
        req.sessionStore.regenerate(req, function(err){
            req.session.username = json.profile.displayName;
        });
        redirect( res, '/' );
    }

};

function redirect(res,location) {
    if( res ) {
        res.writeHead( 302, {
            'Location': location
        });
        res.end();
    }
    else {
        // sys.puts( "Redirecting to: " + location );
    }
}

function isAuthenticated(req) {
    // sys.puts( "Checking auth: " + sys.inspect( req.session ) );
    return req && req.session && req.session.username;
}

function getCredentials(req,res,next) {
    // If we have the body parsed already, use it, otherwise parse ourselves.
    if( req.body ) {
        afterBodyParse( req, res, next );
    }
    else {
        require( 'connect' ).bodyDecoder()( req, res, function() { afterBodyParse( req, res, next ) } );
    }
}

function afterBodyParse( req, res, next ) {
    var token = req.body.token;
    postWithCredentials( token, req, res, next );
}

function postWithCredentials( token, req, res, next ) {
    var apiKey = options['apiKey'];
    var toPost = qs.stringify( { token : token, apiKey : apiKey } );
    var toPostHeader = { 'Host'           : RPX_HOST,
                         'Content-Type'   : 'application/x-www-form-urlencoded',
                         'Content-Length' : toPost.length };
    var rpxResponseBody = '';
    var postRequest = https.request( { port:443, host: RPX_HOST, path: RPX_LOGIN_ROOT, method: 'POST', headers: toPostHeader }, function(rpxResponse) {
       rpxResponse.on( 'data', function( data ) { 
            rpxResponseBody += data; 
        });

        rpxResponse.on( 'end', function() { onCredentialsReceived( rpxResponseBody, req, res, next ) } );
        rpxResponse.on( 'error', onError );             
    });   
    postRequest.on( 'error', onError );  
    postRequest.end(toPost, 'utf8' );               
}

function onError(response) {
    sys.puts( "Something bad happened: " + response );
}

function onCredentialsReceived(data, req, res, next) {
    var json;
    if( data ) {
	try {
	    json = JSON.parse( data );
	}
	catch( e ) {
       sys.puts(data);
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
        // sys.puts( "Setting: " + key + " to " + value );
        options[key] = value;
    }
    return options[key];
}

exports.testRpx = function( token, apiKey ) {
    options['apiKey'] = apiKey;
    postWithCredentials( token );
}

exports.loadConfig = function( filename ) {
    // Do something to load the settings
    fs.readFile( filename, function (err, data) {
        if (err) throw err;
        // convert the data to JSON
        var obj;
        // sys.puts( "Data: " + data );
        try {
            obj = JSON.parse( data );
        }
        catch( e ) {
            sys.puts( "Error in parsing settings file: " + sys.inspect( e ) );
        }
        for( x in obj ) {
            if( 'onSuccessfulLogin' == x ) {
                throw "onSuccessfulLogin needs to be a function, cannot be passed inside configuration file";
            }
            exports.config( x, obj[x] );
        }
    });
};

exports.handler = function() {
    return function(req,res,next) {
        // sys.puts( "Inside RPX: " + req.url );
        if( req.url == options.reentryPoint ) {
            getCredentials(req,res,next);
        }
        else if( req.url == options.loginPage ) {
            next();
        }
        else if( req.url == options.logoutPoint ) {
            // sys.puts( "Inside logout" );
            req.sessionStore.regenerate(req, function(err){
                req.session.username = null;
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
    
