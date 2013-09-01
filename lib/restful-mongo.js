/*
rest.js
mongodb-rest

Created by Tom de Grunt on 2010-10-03.
Copyright (c) 2010 Tom de Grunt.
This file is part of mongodb-rest.
*/
var mongo = require("mongodb"),
    util = require("./util.js"),
    BSON = mongo.BSONPure,
    DaoModule = require('./Dao.js'),
    ConnectionPool=require('./ConnectionPool.js');

// TODO: instead of only one database, based on url, put the possibility to open more connection to different database
//       it requires that module ConnecitonPool instead of only 1 database sotres an object with url2database
//       so if the url is new, then it can create a nre connection, the only problem is that when dao make a query it is 
//       to be able to detect on which database the query is to 
//       be performed, 
//      
//  TODO: in configure, you have to pass app to different methods
//  TODO: transform setGet etc. in ._setGet
/***
    options - it contains the following: USERNAME (optional), PASSWORD (optional), HOST, PORT, DATABASE_NAME
*/
function RestfulMongo(options){
    var self=this
    , options=options||{}
    self.connectionPool=new ConnectionPool(options)
    /*if (options.url){
           
    }else{
        console.log('RestfulMongo requires url for connection')
    }*/
    self.Dao= new DaoModule({
        connectionPool: self.connectionPool
    })
    /*self.connectionPool=new ConnectionPool(options)
    */

}
RestfulMongo.prototype.getDao=function(){
    var self=this
    return self.Dao
}
RestfulMongo.prototype.configure=function(app, options){
    

    /****************/
    var options = options || {}


    if(options.methods) {
        var methods = options.methods
        methods = methods.map(function(m) {
            return m.toLowerCase()
        })

        methods.indexOf('get') >= 0 && setGet()
        methods.indexOf('post') >= 0 && setPost()
        methods.indexOf('put') >= 0 && setPut()
        methods.indexOf('del') >= 0 && setDel()


    } else {
        setGet()
        setPost()
        setPut()
        setDel()
    }
}





function setGet() {
    /**
     * Query
     */
    console.log('RESTful Mongo', 'Configuring GET')

    app.get('/api/:db/:collection/:id?', function(req, res) {
        var query = req.query.query ? JSON.parse(req.query.query) : {};
        console.log(query)

        // Providing an id overwrites giving a query in the URL
        if(req.params.id) {
            query = {
                '_id': new BSON.ObjectID(req.params.id)
            };
        }
        var options = req.params.options || {};
        var fields = {}
        var test = ['limit', 'sort', 'fields', 'skip', 'hint', 'explain', 'snapshot', 'timeout', '$exist'];


        for(o in req.query) {
            if(test.indexOf(o) >= 0) {
                if(o == 'fields') {
                    req.query[o].split(/,/g).forEach(function(fName) {
                        fields[fName] = 1
                    })
                } else if(o == 'sort') {
                    var sort = {}
                    req.query[o].split(/,/g).forEach(function(el) {
                        if(el.match(/^-/g)) {
                            var fieldName = el.substring(1, el.length)
                            sort[fieldName] = -1
                        } else {
                            sort[el] = 1
                        }
                    })
                    options['sort'] = sort
                } /************* code inserted  */
                else if(o == '$exist') {
                    var fs = req.query[o].split(/,/g)
                    fs.forEach(function(f) {
                        query[f] = {
                            $exists: 1
                        }
                    })
                } /* ********* */
                else {

                    options[o] = req.query[o];
                }
            } else {
                if(o == 'or') {
                    var val = req.query[o].substring(1, req.query[o].length - 1),
                        or = []
                        val.split(/,/g).forEach(function(el) {
                            var dict = el.split(/=/g)
                            var obj = {}
                            if(dict[0] == '_id') {
                                dict[1] = new BSON.ObjectID(dict[1])
                            }
                            obj[dict[0].toString()] = dict[1]
                            or.push(obj)
                        })
                        query['$or'] = or
                } else if(o == '$regex') {
                    var field = req.query[o].match(/[^,]*/)[0],
                        regex = req.query[o].match(/,.*/)[0].substring(1)
                        query[field] = {
                            '$regex': regex
                        }
                    console.log('$regex', field, regex)
                } else {
                    query[o] = req.query[o];
                }

            }
        }
        if(req.params.id) {
            Dao.get(req.params.db, req.params.collection, query, fields, options, function(err, doc) {
                if(!err && !doc) {
                    res.send(404)
                } else if(err) {
                    res.json(500, err)
                } else {
                    res.json(200, doc)
                }
            })
        } else {
            Dao.query(req.params.db, req.params.collection, query, fields, options, function(err, docs) {
                if(err) {
                    res.json(500, err)
                } else {
                    res.json(200, docs)
                }
            })
        }
    });
}

function setPost() {
    console.log('RESTful Mongo', 'Configuring POST')
    /**
     * Insert
     */
    app.post('/api/:db/:collection', function(req, res) {
        Dao.save(req.params.db, req.params.collection, req.body, function(err, doc) {
            if(err) {
                return res.json(500, err)
            }
            res.json(200, doc)
        })
    });
}

function setPut() {
    console.log('RESTful Mongo', 'Configuring PUT')

    /**
     * Update
     */
    app.put('/api/:db/:collection/:id', function(req, res) {
        var spec = {
            '_id': new BSON.ObjectID(req.params.id)
        };

        Dao.connectionPool.getDb(function(err, db) {
            if(!err) {
                db.collection(req.params.collection, function(err, collection) {
                    delete req.body._id
                    collection.findAndModify(spec, [], req.body, {
                        new: true,
                        upsert: false
                    }, function(err, doc) {
                        if(err) {
                            res.json(500, err)
                        } else {
                            res.json(200, doc)
                        }
                    });
                });
            }
        })
    });
}

function setDel() {
    console.log('RESTful Mongo', 'Configuring DEL')

    /**
     * Delete
     */
    app.del('/api/:db/:collection/:id', function(req, res) {
        var spec = {
            '_id': new BSON.ObjectID(req.params.id)
        };

        Dao.connectionPool.getDb(function(err, db) {
            if(!err) {
                db.collection(req.params.collection, function(err, collection) {
                    collection.remove(spec, function(err, docs) {
                        res.header('Content-Type', 'application/json');
                        res.send('{"ok":1}');
                    });
                });
            }
        })

    });
}

module.exports=RestfulMongo