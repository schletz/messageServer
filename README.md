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
Mit <code>git clone http://github.com/schletz/messageServer</code> das Repository auf den lokalen Rechner kopieren. 
Danach mit <code>npm install</code> die in der package.json enthaltenen Abhängigkeiten installieren.

Mit <code>node server.js</code> kann der Server in der Konsole gestartet werden. <b>Achtung:</b> damit der Server lauffähig ist,
wird zu Testzwecken der private und public Key für HTTPS mitgeliefert. Dieser muss natürlich durch eigene Keys ersetzt werden!
Unter [http://www.selfsignedcertificate.com/] kann einfach ein solches Zertifikat generiert werden.
