"use strict";
var Sequelize = require('sequelize');
var crypto = require('crypto');        // Für das Erzeugen des Salt

module.exports.loadDatabase = function(connString)
{
    /* Für MySQL lautet der Connection String mysql://root:pass@localhost:3306/dbname */
    //var sequelize = new Sequelize('sqlite://messagedb.db', {});    
    var sequelize = new Sequelize(connString, {});    
    var model = {}
    /* 
     * *********************************************************************************************
     * Model für die Tabelle Users
     * **********************************************************************************************
     */
    model.User = sequelize.define('Users', {        // Tabellenname Users
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
            allowNull: true,
            field:"U_Salt"
        },
        pass: {
            type: Sequelize.STRING,
            allowNull: false,
            set: function(val) { 
                /* Bei einer Passwortänderung wird das Salt auch geändert. */
                var salt = crypto.randomBytes(32).toString('base64');
                this.setDataValue('salt', salt);
                this.setDataValue('pass', crypto.createHmac('sha256', salt)
                            .update(val)
                            .digest('base64')); 
            },      
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
    * ******************************************************************************************
    * Model für die Tabelle Messages
    * ******************************************************************************************
    */
    model.Message = sequelize.define('Messages', {
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

    model.User.hasMany(model.Message, {          // Generiert createMessage und getMessages 
            foreignKey: "M_Autor", 
    });
    model.Message.belongsTo(model.User, {
            as: "autor",                 // Generiert getAutor und createAutor
            foreignKey: "M_Autor"
    });

    return model;
};

