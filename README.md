# nodeWebservice
Ein Musterwebservice in Node JS mit folgenden Features:
- token based authentication
- https Verschlüsselung
- Websocket Server
- MySQL Datenbankzugriff

## Pakete
- express und body-parser für das Routing
- nodejs-websocket für den Websocket
Details siehe <code>package.json</code>

## Installation
Mit <code>git clone https://github.com/schletz/messageServer.git</code> das Repository auf den lokalen Rechner kopieren. 
Danach mit <code>npm install</code> die in der package.json enthaltenen Abhängigkeiten installieren.

Mit <code>node server.js</node> kann der Server in der Konsole gestartet werden. <b>Achtung:</b> damit der Server lauffähig ist,
wird zu Testzwecken der private und public Key für HTTPS mitgeliefert. Dieser muss natürlich durch eigene Keys ersetzt werden!
Unter [http://www.selfsignedcertificate.com/] kann einfach ein solches Zertifikat generiert werden.
