/*
 * Laden der erforderlichen Module.
 */
var fs = require('fs');                    // Für das Lesen der Zertifikate.
var express = require("express");          // Für das Routing.
var bodyParser = require('body-parser');   // Damit POST Variablen gelesen werden können.
var uuid = require('node-uuid');           // Um eine GUID zu generieren.
var https = require('https');              // Der HTTP Server mit der listen Methode.

var Db = require('./messageserver.database');          // ORM Modelklassen laden
var Messageserver = require('./messageserver.class'); 
/*
 * Porteinstellungen. Niedere Ports (< 1024) erfordern u. U. root Rechte beim Ausführen des Servers.
 */
var serverPort = 25221;
var websocketPort = 25222;

/*
 * SSH Keys laden. Diese können am Einfachsten auf
 * [ http://www.selfsignedcertificate.com/ ]
 * generiert werden. Danach die Endung cert auf crt umbenennen.
 */
var privateKey = fs.readFileSync('localhost.key', 'utf8');
var certificate = fs.readFileSync('localhost.crt', 'utf8');
var credentials = { key: privateKey, cert: certificate };

/* Instanzieren des Servers mit den Datenbank- und Websocketeinstellungen */
var myServer = new Messageserver(Db.loadDatabase("sqlite://messagedb.db"), {
                                    websocketPort: websocketPort,
                                    authTimeout: 3600});


/* 
 * *************************************************************************************************
   EVENTS
 * *************************************************************************************************
 */
process.on('exit', function () { process.exit(); });
process.on('SIGINT', function () { process.exit(); });
process.on('uncaughtException', function (err) {
    Messageserver.logger.error(err);
    //process.exit(1);
});


var app = express();
app.use(bodyParser.json());         // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

/* 
 * *************************************************************************************************
   ROUTING
 * *************************************************************************************************
 */

/* 
 * Weiterleitung an die checkCredentials Funktion des Servers. Notwendig, da sonst this in der 
 * checkCredentials Methode auf die nodejs Instanz zeigt.
 */
function checkCredentials (req, res, next) {
    myServer.checkCredentials(req.body.token, req.headers["user-agent"] , 
        req.connection.remoteAddress,  function() {
            next();
        }, function(err) {
            res.send(JSON.stringify({error: err}));
        });
}

app.all("/sendMessage", myServer.setHeader, function (req, res) {
    var guid = uuid.v1(); // UUID V1, damit der generierte Wert aufsteigend ist.
    // Wenn der Parameter message �ber POST gesendet wurde: diesen verwenden. 
    // Ansonsten den GET Parameter message nehmen.
    // Die Namen der Felder m�ssen mit denen in der Datenbank �bereinstimmen.
    var messageData = {
        M_ID: guid, M_ClientIP: req.connection.remoteAddress,
        M_UserAgent: req.headers["user-agent"],
        M_Message: req.body.message == null ? req.query.message : req.body.message
    };
    try {
        myServer.sendMessageToAll(messageData,
            function () { res.send("OK"); },
            function (err) { Messageserver.logger.error(err); }
        );
    }
    catch (err) {
        Messageserver.logger.error(err);
    }
});

/* 
 * Route /getMessages
 * Sendet alle in der Datenbank eingetragenen Nachrichten an den Client.
 * POST Parameter: keine
 * GET Parameter: keine
 * Return: [{M_ID: string, M_Message: string, M_ClientIP: string, M_UserAgent: string}...]
 */
app.all("/getMessages", myServer.setHeader, checkCredentials, function (req, res) {
    myServer.getMessages(function (rows) {         // OnSuccess
        res.send(JSON.stringify(rows));
    }, function (err)  {                           // OnError
        Messageserver.logger.error(err); 
    });   
});

/*
 * Route /auth
 * POST Parameter: user, pass
 * GET Parameter: keine
 * Return: {token: (token)} wenn OK, 
 *         {error: "USER_INVALID"} wenn die Daten falsch sind
 */
app.all("/auth", myServer.setHeader, function (req, res) {
    myServer.createCredentials({
            user: req.body.user,
            pass: req.body.pass,
            useragent: req.headers["user-agent"],
            ip: req.connection.remoteAddress
        }, 
        /* onSuccess */
        function(token) {
            res.send(JSON.stringify({ token: token }));
        }, 
        /* onError */
        function(message) {
            res.send(JSON.stringify({ error: message }));
        });
});

/* 
 * Default Route
 * Wenn kein Routing zutrifft, dann senden wir not found. 
 */
app.use(function (req, res) {
    res.sendStatus(404);
});

/* 
 * *************************************************************************************************
   PORT �FFNEN
 * *************************************************************************************************
 */
console.log("\
    ************************ \n\
    MESSAGESERVER IS RUNNING \n\
    ************************ \n\
    Webservice Port: " + serverPort + "\n\
    Websocket Port: " + websocketPort + "\n\
    "
);
var httpsServer = https.createServer(credentials, app).listen(serverPort);

Messageserver.logger.show("Server started. Aufruf mit https://localhost:" + serverPort);
