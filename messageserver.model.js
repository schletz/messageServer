var Sequelize = require('sequelize');
var crypto = require('crypto');        // Für das Erzeugen des Salt

/* Für MySQL lautet der Connection String mysql://root:pass@localhost:3306/dbname */
var sequelize = new Sequelize('sqlite://messagedb.db', {});

/* *************************************************************************************************
 * Model für die Tabelle Users
 * *************************************************************************************************
 */

var User = sequelize.define('Users', {        // Tabellenname Users
    guid: {
        type: Sequelize.UUID,
        primaryKey: true, 
        defaultValue: Sequelize.UUIDV4,
        field:"U_GUID"
    },
    username: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        field:"U_Username"
    },
    salt: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: function() { return crypto.randomBytes(32).toString('base64'); },
        field:"U_Salt"
    },
    pass: {
        type: Sequelize.STRING,
        allowNull: false,
        set: function(val) { this.setDataValue(
            'pass', crypto.createHmac('sha256', this.getDataValue('salt'))
                          .update(val)
                          .digest('base64')); },      
        field:"U_Pass"
    },
    email: {
        type: Sequelize.STRING,
        allowNull: false,
        field:"U_Email"
    },
    registered: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        field:"U_Registered"
    },
    deactivated: {
        type: Sequelize.DATE,
        allowNull: true,
        field:"U_Deactivated"
    }
}, {
    createdAt: false,    // false, sonst wird eine Spalte createsAt gesucht
    updatedAt: false     // false, sonst wird eine Spalte updatedAt gesucht
});


/* 
 * *************************************************************************************************
 * Model für die Tabelle Messages
 * *************************************************************************************************
 */
var Message = sequelize.define('Messages', {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true, 
        autoIncrement: true,
        field:"M_ID"
    },
    text: {
        type: Sequelize.STRING,
        allowNull: false,
        field:"M_Text"
    },
    created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        field:"M_Created"
    },    
    guid: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        unique: true,
        field:"M_GUID"
    }
}, {
    createdAt: false,
    updatedAt: false
});    


/*
 * *************************************************************************************************
 * ABBILDEN DER REFERENZEN
 * Details siehe http://docs.sequelizejs.com/en/v3/docs/associations/#one-to-many-associations
 * *************************************************************************************************
 */

/* 1 User hat n Messages */
User.hasMany(Message, {          // Generiert createMessage und getMessages 
    foreignKey: "M_Autor", 
});
Message.belongsTo(User, {
    as: "autor",                 // Generiert getAutor und createAutor
    foreignKey: "M_Autor"
});

User.findOne({where: {username:"Max"}, defaults: {username: "Max", pass:"1234", email:"max@muster.at"}}).then(function(max)
{
    max.getMessages();
    max.createMessage({text:"Hallo"}).then(function(maxMessage) {
        maxMessage.getAutor().then(function(max) { console.log(JSON.stringify(max))});
    });
});
