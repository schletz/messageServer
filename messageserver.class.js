var ws     = require("nodejs-websocket");   // npm install nodejs-websocket
var crypto = require('crypto');             // npm install crypto

/*
 * Messageserver(json, json)
 */
function Messageserver(dbModel, config)
{
    this.userlist = {};
    this.authTimeout =
    this.model = dbModel;

    this.websocketServer = ws.
        createServer(this.onWebsocketConnect).
        listen(config.websocketPort);

/*
this.model.User.findOne({where: {username:"Max"}, defaults: {username: "Max", pass:"1234", email:"max@muster.at"}}).then(function(max)
{
    max.getMessages();
    max.createMessage({text:"Hallo"}).then(function(maxMessage) {
        maxMessage.getAutor().then(function(max) { console.log(JSON.stringify(max))});
    });
});

*/
}

/* 
 * setHeader(json, json, function)
 * Setzt die HTTP Header, sodass von jeder Domäne aus das Webservice aufgerufen werden kann.
 * Weiters wird der Content Type der Antwort auf JSON gesetzt.
 */
Messageserver.prototype.setHeader = function (req, res, next) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
};

/*
 * onWebsocketConnect(json)
 * Wird aufgerufen, wenn eine Verbindung vom Client zum Socketserver aufgebaut wurde.
 * Wenn der Client nicht den richtigen Pfad verwendet (ws://..../tetra), dann wird
 * die Verbindung sofort wieder geschlossen.
 *
 * conn: Das Connection Objekt der Verbindung.
 */
Messageserver.prototype.onWebsocketConnect = function(conn) {
    if (conn.path !== "/chatserver") {
        conn.close();
        return;
    }
    Messageserver.logger.show("Websocket client connected: " + conn.headers.origin);
};

/*
 * getMessages
 * Liest alle Nachrichten aus der Messages Tabelle und liefert sie zurück.
 * @param {function} onSuccess(rows:json) Ein JSON Array mit allen Nachrichten.
 * @param {function} onError(message:string) Fehlermeldung, falls die Datenbankabfrage nicht
 * funktioniert hat.
 */
Messageserver.prototype.getMessages = function (onSuccess, onError) {
    var onSuccess = typeof onSuccess === "function" ? onSuccess : function() {};
    var onError   = typeof onError   === "function" ? onError   : function() {};

    /* Auch den User zur Nachricht raussuchen. Siehe Eager loading auf 
     * http://docs.sequelizejs.com/en/latest/docs/models-usage/
     * Das as muss mit dem im Model bei belongsTo() definiertem Alias übereinstimmen.
     */
    this.model.Message.findAll({include:[{model:this.model.User, as:'autor'}]}).then(function(result) {
        onSuccess(result);
    }).catch (onError);

    /* So könnte man alle User mit ihren Nachrichten auslesen. Da kein as definiert wurde, muss es
     * auch nicht angegeben werden.
    /*
    this.model.User.findAll({include:[{model:this.model.Message}]}).then(function(result) {
        onSuccess(result);
    }).catch (onError);    
    */
};

/*
 * sendMessageToAll(string, function, function)
 * Sendet allen verbundenen Clients die in messageStr enthaltene Nachricht. Weiters wird der String
 * in die Tabelle messages geschrieben.
 */
Messageserver.prototype.sendMessageToAll = function (messageStr, onSuccess, onError) {
    try {
        this.dbConnection.query("INSERT INTO messages SET ?", { M_Message: messageStr });
        this.websocketServer.connections.forEach(function (conn) {
            try {
                conn.sendText(messageStr);
            }
            catch (err) {
                if (typeof onError === "function") onError();
            }
        });
    if (typeof onSuccess === "function") onSuccess();
    }
    catch (err) {
        if (typeof onError === "function") onError();
    }
};

/*
* checkCredentials
* Prüft den übergebenen Token. Wenn dieser gültig ist, dann wird die in onSuccess übergebene 
* Funktion aufgerufen und die Gültigkeitszeit des Tokens neu gesetzt.
* @param {string} token Der übermittelte, zu prüfende Token.
* @param {string} userAgent Der übermittelte HTTP User Agent.
* @param {string} clientIp Die IP Adresse des Clients.
* @param {function} onSuccess() Wird aufgerufen, wenn der Token gültig ist.
* @param {function} onError(message:string) Wenn der Token üntültig ist, wird die message auf
* "INVALID_ARGUMENT", "INVALID_TOKEN",  "NOT_AUTH", "AUTH_TIMEOUT" oder "INVALID_CREDENTIALS" 
* gesetzt.
*/
Messageserver.prototype.checkCredentials = function (token, userAgent, clientIp, onSuccess, onError) {
    var onSuccess = typeof onSuccess === "function" ? onSuccess : function() {};
    var onError   = typeof onError   === "function" ? onError   : function() {};

    /* Argumente übergeben? */
    if (!isType("string", token))     {  onError("INVALID_ARGUMENT");  return;  }
    if (!isType("string", userAgent)) {  onError("INVALID_ARGUMENT");  return;  }
    if (!isType("string", clientIp )) {  onError("INVALID_ARGUMENT");  return;  }

    var tokenDecoded = new Buffer(token, 'base64').toString('utf8').split(":");
    if (tokenDecoded.length != 2) {
        onError("INVALID_TOKEN");
        return;        
    }
    /* Ist der User in unserer Userlist? */
    var userinfo = this.userlist[tokenDecoded[0]];
    if (!isType("object", userinfo))  {  onError("NOT_AUTH"); return;  }
    /* 
     * Stimmt der Hashwert von IP, Useragent und Secret, wenn wir ihn neu generieren, 
     * mit dem übermittelten überein und ist er auch nicht abgelaufen? 
     */
    var toHash = userAgent + clientIp + userinfo.secret;
    var hashed = crypto.createHmac('sha256', userinfo.secret)
                        .update(toHash)
                        .digest('base64');
    /* Ist der Token abgelaufen? */
    if (new Date().valueOf() - this.authTimeout * 1000 > userinfo.lastActivity) {
        onError("AUTH_TIMEOUT");
        return;        
    }
    /* Stimmt der Hashwert noch? */
    if (tokenDecoded[1] !== hashed) {
        onError("INVALID_CREDENTIALS");
        return;        
    }
    /* Damit das Timeout von der letzten Aktivität gerechnet wird, setzen wir es neu. */
    userinfo.lastActivity = new Date().valueOf();
    onSuccess();
};

/*
 * createCredentials
 * Prüft die Daten des übergebenen Benutzers und liefert einen Token, der mit jedem Request 
 * mitgesendet wird. 
 * @param {json} userinfo {user:string, pass:string useragent:string, ip:string}
 * @param {function} onSuccess(token:string) Bei Erfolg wird der Token zurückgegeben
 * @param {function} onError(message:string) Im Fehlerfall wird INVALID_ARGUMENT, INVALID_USER oder 
 * INVALID_PASSWORD zurückgegeben.
 */
Messageserver.prototype.createCredentials = function (userinfo, onSuccess, onError) {
    var self = this;                          // Da in der Callback Methode der DB this sich ändert.
    var onSuccess = typeof onSuccess === "function" ? onSuccess : function() {};
    var onError = typeof onError === "function" ? onSuccess : function() {};

    if (!isType("string", userinfo.user, userinfo.pass)) {
        onError("INVALID_ARGUMENT");
        return;
    }

    /* Den übergebenen User in der Datenbank suchen */
    this.model.User.findOne({where: {username: userinfo.user}}).then(function(currentUser)
    {
        try
        {
            /* Benutzer ist vorhanden */
            if (currentUser !== null)
            {
                /* Lässt sich aus dem Passwort und dem gespeicherten Salt der gespeicherten Hashwert
                * generieren? */
                var passwordHash = crypto.createHmac('sha256', currentUser.salt)
                                        .update(userinfo.pass)
                                        .digest('base64');
                console.log(passwordHash);

                /* Hash ungleich: falsches Passwort! */
                if (passwordHash !== currentUser.pass) {
                    onError("INVALID_PASSWORD");
                    return;
                }                                  

                /* Alles OK: Token generieren und in die lokale Userliste des Servers eintragen */
                var secret = crypto.randomBytes(32).toString('base64');
                var toHash = userinfo.useragent +
                            userinfo.ip +
                            secret;
                var hashed = crypto.createHmac('sha256', secret)
                                .update(toHash)
                                .digest('base64');
                var token = new Buffer(userinfo.user + ":" + hashed)
                    .toString('base64');

                /* Zum Testen */
                console.log("Token:", token);
                console.log("Decodierder Token:", new Buffer(token, 'base64').toString('utf8'));

                /* Das Secret und den Timestamp zu den Userinfos dazugeben und den User anlegen. */
                userinfo.secret = secret;
                userinfo.lastActivity = new Date().valueOf();
                self.userlist[userinfo.user] = userinfo;
                onSuccess(token);
            }
            else {
                onError("INVALID_USER");
            }
        }
        catch (err)
        {
            onError(err.message);
        }

    }).catch(onError);
};

/*
 * logger.show(string) bzw. logger.error(string)
 * Gibt den �bergebenen String mit einem Timestamp in der Konsole aus.
 * Parameter message: Auszugebende Meldung
 */
Messageserver.logger = {
    "show": function (message) {
        var _date = new Date();
        console.log(_date.toISOString() + " " + message.toString());
    },
    "error": function (message) {
        var _date = new Date();
        console.error("\033[91m"+_date.toISOString() + " " + message.toString()+"\033[0m");
    }
};

/*
 * isType(string, variable1, variable2, ...)
 * Pr�ft, ob alle Variablen den im 1. Parameter angegebenen String entsprechen.
 * Der Typname kann folgende Werte beinhalten: 
 * "undefined", "object", "boolean", "number", "string", "symbol", "function"
 */
function isType() {
    try {
        var reqType = arguments[0];
        for (var i = arguments.length - 1; i >= 1; --i) {
            if (typeof arguments[i] !== reqType) return false;
        }
        return true;
    }
    catch (e) {
    }
    return false;
}

/*
 * Export des Messageservers. Sonst ist diese Klasse nicht im aufrufenden Programm bekannt.
 */
module.exports = Messageserver;
