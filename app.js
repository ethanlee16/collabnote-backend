/*
And all you need to do is write some JavaScript code
And use the real-time web with Node
https://www.youtube.com/watch?v=IkmHStAWXis
*/

var express = require('express');
var multer = require('multer');
var storage = multer.diskStorage({
    destination: function(req, file, mu) {
        mu(null, './public/files/');
    },
    filename: function(req, file, mu) {
        mu(null, Date.now() + file.originalname.replace(/\s+/g, '').toLowerCase());
    }
});
var upload = multer({storage: storage});

// For private keys
var config = require('./config');
var fs = require('fs');
var crypto = require('crypto');
var Parse = require('parse').Parse;
var File = Parse.Object.extend("File");

var API_VER = '1.0';
var app = express();
Parse.initialize(config.parseAppID, config.parseKey);

app.use(express.static(__dirname + '/public'));

app.all('*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.post('/api/' + API_VER + '/upload', upload.single('file'), function(req, res) {
    console.log(req.file);
    var hash = checksum(req.file.path, function(digest) {
        var file = new File();
        file.set("filepath", req.file.path);
        file.set("checksum", digest);

        file.save(null, {
            success: function(file) {
                console.log(file);
                res.end();
            },
            error: function(file, err) {
                console.log("Error!")
            }
        });
        
    });
    
});

function checksum(filepath, callback) {
    var hash = crypto.createHash('md5');
    var stream = fs.createReadStream(filepath);

    stream.on('data', function(data) {
        hash.update(data, 'utf8');
    });
    var digest = "";
    stream.on('end', function () {
        digest += hash.digest('hex');
        console.log("Digested hash: " + digest);
        callback(digest);
    });
}

app.listen(process.env.PORT);