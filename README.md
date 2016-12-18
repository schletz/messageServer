# nodeWebservice
Ein Musterwebservice in Node JS mit folgenden Features:
- token based authentication
- https Verschlüsselung
- ORM Mapper für den Datenbankzugriff
- Websocket Server

## Pakete
- express und body-parser für das Routing
- sequelize als ORM Mapper und Datanbankabstraktion
- nodejs-websocket für den Websocket
- Weitere Details siehe <code>package.json</code>

## Installation
Mit <code>git clone http://github.com/schletz/messageServer</code> das Repository auf den lokalen 
Rechner kopieren. Danach mit <code>npm install</code> die in der package.json enthaltenen 
Abhängigkeiten installieren. Mit <code>node server.js</code> kann der Server in der Konsole gestartet 
werden. <b>Achtung:</b> damit der Server lauffähig ist, wird zu Testzwecken der private und public 
Key für HTTPS mitgeliefert. Dieser muss natürlich durch eigene Keys ersetzt werden!
Unter [http://www.selfsignedcertificate.com/] kann einfach ein solches Zertifikat generiert werden.

## Anpassung an ein eigenes Projekt
1. <b>Die Modelklassen erstellen:</b> Die Datei <code>messageserver.database.js</code> ist eine gute Vorlage, 
wie das Paket sequelize die Klassendefinitionen verlangt. Es müssen auch die 
Fremdschlüsselbeziehungen dort modelliert werden. Für das Erstellen des Modelles gibt es zwar Tools
für den Database First Ansatz, das händische Erstellen hat aber den Vorteil, dass auch gleich get 
und set Methoden sowie Validatoren gleich mitdefiniert werden können.
2. <b>Den Connectrionstring anpassen:</b> In der server.js wird mit 
<code>Db.loadDatabase("sqlite://messagedb.db")</code> der Connectionstring übergeben. Dieser muss 
natürlich auf eine eigene MySql oder Postgresql Datenbank verweisen.
3. <b>Die Routen anpassen:</b> In der server.js können eigene Routen hinzugefügt werden.

###Anmerkung zur Authentifizierung 
Die Methode <code>createCredentials</code> verlangt in der Usertabelle Spalten für Benutzername 
(Property user im Modell User), Salt (Property salt im Modell User) und das mit SHA256 
verschlüsselte Passwort (Property pass im Modell User). Wenn diese Spalten nicht so heißen bzw.
die Modelklasse für die Benutzertabelle nicht User heißt, muss diese Methode angepasst werden.

Diese Methode wird in der Route /auth aufgerufen. Dabei wird ein Token sowie ein Key für den Zugriff
auf den Websocket Server generiert.

Die Funktion <code>checkCredentials</code> wird bei allen Express Routen verwendet, wo ein gültiger 
Token übergeben werden muss. 
