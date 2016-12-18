# messageServer
Ein Musterwebservice in Node JS mit folgenden Features:
- token based authentication
- https Verschlüsselung
- ORM Mapper für den Datenbankzugriff
- Websocket Server

## Pakete
- express und body-parser für das Routing
- sequelize als ORM Mapper und Datanbankabstraktion
- nodejs-websocket für den Websocket
- Weitere Details siehe `package.json`

## Installation
Mit `git clone http://github.com/schletz/messageServer` das Repository auf den lokalen 
Rechner kopieren. Danach mit `npm install` die in der package.json enthaltenen 
Abhängigkeiten installieren. Mit `node server.js` kann der Server in der Konsole gestartet 
werden. **Achtung:** damit der Server lauffähig ist, wird zu Testzwecken der private und public 
Key für HTTPS mitgeliefert. Dieser muss natürlich durch eigene Keys ersetzt werden!
Unter http://www.selfsignedcertificate.com/ kann einfach ein solches Zertifikat generiert werden.

Im Browser kann mit https://localhost die Installation getestet werden. Die index.html Datei im 
public Verzeichnis erlaubt das Senden von Nachrichten und das Anlegen von Benutzern.

## Anpassung an ein eigenes Projekt
1. **Die Modelklassen erstellen:** Die Datei `messageserver.database.js` ist eine gute Vorlage, 
wie das Paket sequelize die Klassendefinitionen verlangt. Es müssen auch die 
Fremdschlüsselbeziehungen dort modelliert werden. Für das Erstellen des Modelles gibt es zwar Tools
für den Database First Ansatz, das händische Erstellen hat aber den Vorteil, dass auch gleich get 
und set Methoden sowie Validatoren gleich mitdefiniert werden können.
2. **Eine eigene Klasse mit der Businesslogik erstellen:** Die Klasse Messageserver passt natürlich
nicht zum eigenen Projekt. Einige Methoden wie das Anlegen der Token und der Konstruktor können aber 
übernommen werden.
3. **Den Connectionstring anpassen:** In der server.js wird mit 
`Db.loadDatabase("sqlite://messagedb.db")` der Connectionstring übergeben. Dieser muss 
natürlich auf eine eigene MySql oder Postgresql Datenbank verweisen.
4. **Die Routen anpassen:** In der server.js können eigene Routen hinzugefügt werden.

### Anmerkung zur Authentifizierung 
Die Methode `createCredentials` verlangt in der Usertabelle Spalten für Benutzername 
(Property user im Modell User), Salt (Property salt im Modell User) und das mit SHA256 
verschlüsselte Passwort (Property pass im Modell User). Wenn diese Spalten nicht so heißen bzw.
die Modelklasse für die Benutzertabelle nicht User heißt, muss diese Methode angepasst werden.

Diese Methode wird in der Route `/auth` aufgerufen. Dabei wird ein Token sowie ein Key für den Zugriff
auf den Websocket Server generiert.

Die Funktion `checkCredentials` wird bei allen Express Routen verwendet, wo ein gültiger 
Token übergeben werden muss. 

## Webservice Definition
URL              | Beschreibung                                             | Method | POST Parameter (x-www-form-urlencoded) | HTTP Response
-----------------|----------------------------------------------------------|--------|----------------------------------------|-------------------
**/createUser**  | Erstellt einen Benutzer.                                 | POST   | user:string, pass:string, email:string | 200: {user:string, email:string} oder 200: {error:string}
**/auth**        | Führt die Autentifizierung durch.                        | POST   | user:string, pass:string               | 200: {token:string, websocketKey:string} oder 200: {error:string}
**/getMessages** | Liefert alle in der Datenbank gespeicherten Nachrichten. | POST   | token:string                           | 200: [{created:string, text:string, autor: {username:string, email:string}},...] oder 200: {error:string}
**/sendMessage** | Sendet die Nachricht an alle Clients.                    | POST   | message:string, token:string           | 200: {autor:string,message:string} oder 200: {error:string}
**/public**      | Filserver für statische Dateien.                         |  GET      |                                        | 200 oder 404 (Not found)


