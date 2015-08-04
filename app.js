/*

♪ And all you need to do is write some JavaScript code
And use the real-time web with Node ♪

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
var http = require("http");
var https = require("https");
var _ocrsdk = require('./lib/ocrsdk');

// For private keys
var config = require('./config');
var fs = require('fs');
var crypto = require('crypto');
var Parse = require('parse').Parse;
var File = Parse.Object.extend("File");
var ocrsdk = _ocrsdk.create(config.ocrsdkID, config.ocrsdkPass);

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
    var resp = {
        "result": "",
        "file": {"id": "", "filepath": "", "text": "", "notes": [], "user": ""}
    };
    var text = "";
    var content;
    var filepath = req.file.path;

    if(filepath.substring(filepath.length - 3, filepath.length) !== "jpg") {
        https.get("https://api.idolondemand.com/1/api/sync/extracttext/v1"
            + "?apikey=" + config.hpKey + "&url=" + config.baseURL 
            + req.file.path.replace('public/', ''), function(resp) {
            resp.on('data', function(data) {
                text += data;
            }).on('end', function() {
                console.log(text);
                content = JSON.parse(text);
                processFile();
            });
        });
    } else {
        var opt = new _ocrsdk.ProcessingSettings();
        opt.language = "English";
        opt.exportFormat = "txt";
        ocrsdk.processImage(filepath, opt, function(err, data) {
            if(err) {
                console.log("OCRSDK Error: " + err.message);
            }
            ocrsdk.waitForCompletion(data.id, function(err, data) {
                if(err) {
                    console.log("OCRSDK Error: " + err.message);
                }
                https.get(data.resultUrl.toString(), function(resp) {
                    resp.on('data', function(data) {
                        text += data;
                    }).on('end', function() {
                        console.log(text);
                        content = {
                            "document": [{
                                "content": text
                            }]
                        };
                        processFile();
                    })
                });
            });
        });
    }
    

    var processFile = function() {
        var hash = checksum(req.file.path, function(digest) {
            var query = new Parse.Query(File);
            query.equalTo("checksum", digest);
            query.find({
                success: function(results) {
                    if(results.length > 0) {
                        resp.result = "exists";
                        resp.file.id = results[0].id;
                        resp.file.filepath = results[0].get("filepath");
                        resp.file.text = results[0].get("text");
                        resp.file.notes = results[0].get("notes");
                        resp.file.user = results[0].get("user");
                        fs.unlinkSync(req.file.path);
                        res.send(resp);
                    }
                    else {
                        var file = new File();

                        file.set("filepath", req.file.path);
                        file.set("checksum", digest);
                        file.set("upvotes", 0);
                        file.set("downvotes", 0);
                        file.set("notes", []);
                        file.set("text", content.document[0].content);
                        file.set("user", req.body.user);

                        file.save(null, {
                            success: function(file) {
                                console.log(file);
                                resp.result = "created";
                                resp.file.id = file.id;
                                resp.file.filepath = file.get("filepath");
                                resp.file.text = file.get("text");
                                resp.file.user = file.get("user");
                                createNotes(file, function() {
                                    resp.file.notes = file.get("notes");
                                    res.send(resp);
                                })
                            },
                            error: function(file, err) {
                                console.log("Parse error: " + err);
                                res.status(500).send("500 - an error occurred.");
                            }
                        });
                    }
                },
                error: function(err) {
                    console.log("Error: " + err);
                    res.status(500).send("500 - an error occurred.")
                }
            });
        });
    };
});

app.get('/api/' + API_VER + '/getnotes/:id', function(req, res) {
    var query = new Parse.Query(File);
    query.get(req.params.id, {
        success: function(file) {
            var notes = file.get("notes");
            var result = {notes: notes};
            res.send(result);
        },
        error: function(file, err) {
            console.log("Parse error: " + err);
            res.status(500).send("500 - an error occurred.");
        }
    })
});

app.get('/api/' + API_VER + '/getfiles/:user', function(req, res) {
    console.log("Attempting to get files for " + req.params.user);
    var query = new Parse.Query(File);
    query.equalTo("user", req.params.user);
    var resp = {"results": []};
    query.find({
        success: function(results) {
            for(var i = 0; i < results.length; i++) {
                resp.results.push({"file": {
                    "id": results[i].id,
                    "filepath": results[i].get("filepath"),
                    "text": results[i].get("text"),
                    "notes": results[i].get("notes")
                }})
            }
            res.send(resp);
        },
        error: function(err) {
            console.log("Error: " + err);
            res.status(500).send("500 - an error occurred");
        }
    });
});

/* Leenote: a route located at /api/1.0/storenotes/<file ID> */
app.post('/api/' + API_VER + '/storenotes/:id', function(req, res) {
    var query = new Parse.Query(File);
    query.get(req.params.id, {
        success: function(file) {
            /* 
               right here, we can put your notes creation API logic
               and store it to Parse
               
               Leenote: use the http module https://nodejs.org/api/http.html 
            */
            file.set("notes", []);
        },
        error: function(file, err) {
            res.status(404).send("File with ID " + req.params.id + " could not be loaded.");
        }
    });
});

app.get('/api/' + API_VER + '/score/:id', function(req, res) {
    var query = new Parse.Query(File);
    query.get(req.params.id, {
        success: function(file) {
            var upvotes = file.get("upvotes");
            var downvotes = file.get("downvotes");

            var result = {score: (upvotes - downvotes)};
            res.send(result);
        },
        error: function(file, err) {
            console.log("Parse error: " + err);
            res.status(500).send("500 - an error occurred.");
        }
    })
});

app.get('/api/' + API_VER + '/:action/:id', function(req, res) {
    var query = new Parse.Query(File);
    
    // Leenote: this is either upvote or downvote from :action
    var vote = req.params.action + "s";
    
    query.get(req.params.id, {
        success: function(file) {
            file.set(vote, file.get(vote) + 1);
            file.save(null, {
                success: function(file) {
                    res.status(200).end();
                },
                error: function(file, err) {
                    console.log("Parse error: " + err);
                    res.status(500).send("500 - an error occurred.");
                }
            });
        },
        error: function(file, err) {
            console.log("Parse error: " + err);
            res.status(500).send("500 - an error occurred.");
        }
    })
});

function createNotes(file, callback) {
    var content = "";
    var notes = [];
    var text = file.get("text");
    if(text.length >= 7864) {
        text = text.substring(0, 7863);
    }
    console.log("Gotten text: " + text);
    var relevance = 0.6;

    // WELCOME TO CALLBACK HELL (fixme)
    http.get("http://access.alchemyapi.com/calls/text/TextGetRankedNamedEntities?"
    + "apikey=" + config.alchemyKey + "&text=" + text + "&outputMode=json", function(resp) {
        resp.on('data', function(data) {
            content += data;
        }).on('end', function() {
            var rawnotes = JSON.parse(content);
            console.log(content);
            for (var i = 0; i < rawnotes.entities.length; i++) {
                if (rawnotes.entities[i].relevance > relevance) {
                    notes.push(rawnotes.entities[i]);
                    notes[notes.length - 1].sentences = [];
                    notes[notes.length - 1].subTopics = [];
                }
            }
        
            console.log("Pass 1: " + notes);
            content = "";
            http.get("http://access.alchemyapi.com/calls/text/TextGetRelations?"
            + "apikey=" + config.alchemyKey + "&text=" + text + "&keywords=1&outputMode=json", function(resp) {
                resp.on('data', function(data) {
                    content += data;
                }).on('end', function() {
                    var rawnotes2 = JSON.parse(content);
                    console.log(content);
                    try {
                        for (var x = 0; x < notes.length; x++) {
                            for (var j = 0; j < rawnotes2.relations.length; j++) {
                                if(rawnotes2.relations[j].subject.hasOwnProperty("keywords")) {
                                    if (notes[x].text == rawnotes2.relations[j].subject.keywords[0].text) {
                                        notes[x].sentences.push(rawnotes2.relations[j].object.text)
                                        if (rawnotes2.relations[j].object.hasOwnProperty("keywords")) {
                                            for (var b = 0; b < rawnotes2.relations[j].object.keywords.length; b++) {
                                                notes[x].subTopics.push(rawnotes2.relations[j].subject.keywords[b].text);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    catch(err) {
                        console.log("Not getting notes for this one... " + err);
                    }
                    
                    console.log("Pass 2: " + notes);
                    file.set("notes", notes);
                    file.save(null, {
                        success: function(file) {
                            console.log("Saved file successfully");
                            callback();
                        },
                        error: function(file, err) {
                            console.log("Parse oopsie " + err);
                        } 
                    })
                })
            }) // ends the 2nd http get
        })
    });
}

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

app.listen(process.env.PORT || 3005);