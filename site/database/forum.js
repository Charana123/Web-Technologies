"use strict"

const challengeAPI = require("./challenges.js")

module.exports = {
    ForumHandler: ForumHandler
};

function ForumHandler(database) {
    return (function() {

        var db = database;
        var challengeHandler = challengeAPI.ChallengesHandler(db);

        function getReplys(postId, userId) {
            return new Promise(function (resolve, reject) {
                db.rowsByField("forum_reply", "post", postId).then(function(replys) {
                    var promises = [];

                    replys.forEach((r) => {
                        promises.push(db.rowsByField("users", "id", r.user));
                    });


                    var sortReplys = function(replys, users) {
                        users.forEach(function(u) {
                            replys.forEach((r, i) => {
                                if (u[0] && r.user == u[0].id) {
                                    replys[i].userData = {
                                        id: u[0].id,
                                        username: u[0].username,
                                        image: u[0].image
                                    };
                                }
                            });
                        });

                        var ret = [];

                        var count = replys.length;
                        var stop = 5;

                        replys.forEach((r) => {
                            if (r.parent == 0) {
                                r.children = [];
                                ret.push(r);
                                count--;
                            }
                        });

                        for (; count > 0; ) {
                            for (let r of replys) {
                                if (r.parent != 0) {

                                    for (const [index, el] of ret.entries()) {
                                        if (el.id == r.parent && !ret[index].children[r.id]) {
                                            ret[index].children.push(r);
                                            count--;
                                        }

                                        for (const [indexR, elR] of ret[index].children.entries()) {
                                            if (elR.id == r.parent && !ret[index].children[r.id]) {
                                                ret[index].children.push(r);
                                                count--;
                                            }
                                        }
                                    }
                                }
                            }

                            stop--;
                            if (stop == 0) break;
                        }

                        return ret;
                    };

                    Promise.all(promises).then(function(users) {
                        var ret;

                        if (userId) {
                            promises = [];
                            replys.forEach((r) => {
                                promises.push(db.getVoteReply(userId, r.id));
                            });

                            Promise.all(promises).then(function(voted) {
                                replys.forEach((r) => {
                                    r.voted = 0;
                                    for (let v of voted) {
                                        if (v[0] && r.id == v[0].reply) {
                                            r.voted = v[0].value;
                                            break;
                                        }
                                    };
                                });

                                ret = sortReplys(replys, users);
                                resolve(ret);
                                return;
                            }, function(err) {
                                reject(err);
                                return;
                            });

                        } else {
                            ret = sortReplys(replys, users);
                            resolve(ret);
                            return;
                        }
                    }, function(err) {
                        reject(err);
                        return;
                    });
                }, function(err) {
                    reject("unable to get forum replys by post ID: "+err);
                    return;
                });
            });
        };

        function sortObj(list, key) {
            function compare(a, b) {
                a = a[key];
                b = b[key];
                var type = (typeof(a) === 'string' ||
                    typeof(b) === 'string') ? 'string' : 'number';
                var result;
                //if (type === 'string') result = a.localeCompare(b);
                if (type === 'string') result = Date.parse(b) - Date.parse(a)
                else result = b - a;
                return result;
            }
            return list.sort(compare);
        }

        function sortObjBack(list, key) {
            function compare(a, b) {
                a = a[key];
                b = b[key];
                var type = (typeof(a) === 'string' ||
                    typeof(b) === 'string') ? 'string' : 'number';
                var result;
                //if (type === 'string') result = a.localeCompare(b);
                if (type === 'string') result = Date.parse(a) - Date.parse(b)
                else result = a - b;
                return result;
            }
            return list.sort(compare);
        }

        var newPost = function(db, userId, title, body, subject) {
            return new Promise(function(resolve, reject) {
                db.newForumPost(userId, title, body, subject).then(function(res) {
                    resolve(res);
                    return;
                }, function(err) {
                    reject(err);
                    return;
                });
            });
        };

        var newReply = function(db, postId, userId, body, parent) {
            return new Promise(function(resolve, reject) {
                db.newForumReply(postId, parent, userId, body).then(function(res) {
                    resolve(res);
                    return;
                }, function(err) {
                    reject(err);
                    return;
                });
            });
        };

        var increaseViews = function(db, post, userId) {
            return new Promise(function(resolve, reject) {
                db.updateFieldByValue("forum_post", "views", post.views+1, "id", post.id).then(function(res) {
                    resolve(post);
                }, function(err) {
                    reject(err);
                });
            });
        };

        var increaseVote = function(db, post, table, userId) {
            return new Promise(function(resolve, reject) {
                var promise;
                if (table == "forum_post") {
                    promise = db.updateVotePost(userId, post, 1);
                } else {
                    promise = db.updateVoteReply(userId, post, 1);
                }

                promise.then(function(res) {
                    db.rowsByField(table, "id", post).then(function(posts) {
                        db.updateFieldByValue(table, "votes", posts[0].votes+1, "id", post).then(function(res) {
                            resolve(post);
                        }, function(err) {
                            reject(err);
                        });

                    }, function(err){
                        reject(err);
                    });
                }, function(err){
                    reject(err);
                });
            });
        };

        var decreaseVote = function(db, post, table, userId) {
            return new Promise(function(resolve, reject) {
                var promise;
                if (table == "forum_post") {
                    promise = db.updateVotePost(userId, post, -1);
                } else {
                    promise = db.updateVoteReply(userId, post, -1);
                }

                promise.then(function(res) {
                    db.rowsByField(table, "id", post).then(function(posts) {
                        db.updateFieldByValue(table, "votes", posts[0].votes-1, "id", post).then(function(res) {
                            resolve(post);
                        }, function(err) {
                            reject(err);
                        });
                    }, function(err) {
                        reject(err);
                    });
                }, function(err) {
                    reject(err);
                });
            });
        };

        var getPost = function(db, postId, userId) {
            return new Promise(function(resolve, reject) {
                db.rowsByField("forum_post", "id", postId).then(function(posts) {
                    db.rowsByField("users", "id", posts[0].user).then(function(user) {

                        var getVoted = function(posts, userId) {
                            return new Promise(function(resolve, reject) {
                                if (userId) {
                                    db.getVotePost(userId, posts[0].id).then(function(voted) {
                                        if (voted.length == 0) {
                                            posts[0].voted = 0;
                                        } else {
                                            posts[0].voted = voted[0].value
                                        }
                                        resolve(posts);
                                        return;
                                    });
                                } else {
                                    resolve(posts);
                                    return;
                                }
                            });
                        };

                        getVoted(posts, userId).then(function(posts) {

                            posts[0].userData = {
                                id: user[0].id,
                                username: user[0].username,
                                image: user[0].image
                            };

                            getReplys(posts[0].id, userId).then(function(replys) {
                                posts[0].replys = sortObjBack(replys, "time");
                                increaseViews(db, posts[0]).then(function(post) {
                                    resolve(posts[0]);
                                    return;
                                }, function(err) {
                                    reject(err)
                                    return;
                                });

                            }, function(err) {
                                reject(err);
                                return;
                            });
                        }, function(err) {
                            reject(err);
                            return;
                        });
                    }, function(err) {
                        reject(err);
                        return;
                    });
                }, function(err) {
                    reject(err);
                    return;
                });
            });
        };

        var getForumsByUser = function(db, userId) {
            return new Promise(function(resolve, reject) {
                db.rowsByField("forum_post", "user", userId).then(function(posts) {
                    var promises = [];
                    var fullForums = {};

                    posts.forEach((post) => {
                        promises.push(getReplys(post.id, userId));
                        fullForums[post.id] = {post: post, replys: []};
                    });

                    Promise.all(promises).then(function(resp) {
                        var replys = resp[0];
                        replys[0].forEach((reply) => {
                            fullForums[reply.post].replys.push(reply);
                        });
                        resolve(fullForums);
                        return;

                    }, function(err) {
                        reject(err);
                        return;
                    });

                }, function(err) {
                    reject("unable to get forum posts by user: "+err);
                });
            });
        };

        var getForumsBySubject = function(db, subject, sort, userId) {
            return new Promise(function(resolve, reject) {
                getAllPosts(db, sort, userId).then(function(posts) {
                    Object.keys(posts.fullForums).forEach((f) => {
                        if (!(posts.fullForums[f].post.subject == subject)) {
                            delete posts.fullForums[f];
                        }
                    });

                    posts.current = subject;
                    resolve(posts);
                    return;

                }, function(err) {
                    reject(err);
                    return;
                });

            }, function(err) {
                reject("unable to get forum posts by subject: "+err);
            });
        };

        var getAllPosts = function(db, sort, userId) {
            return new Promise(function (resolve, reject) {
                db.getAll("forum_post").then(function(posts) {
                    var promises = [];
                    var fullForums = [];

                    if (sort) {
                        posts = sortObj(posts, sort);
                    }

                    var getVotedOnPosts = function(posts, userId) {
                        return new Promise(function(resolve, reject) {
                            if (userId) {
                                var promises = [];
                                posts.forEach((p) => {
                                    promises.push(db.getVotePost(userId, p.id));
                                });

                                Promise.all(promises).then(function(voted) {

                                    posts.forEach((p) => {
                                        p.voted = 0;
                                        for (let v of voted) {
                                            if (v[0] && p.id == v[0].post) {
                                                p.voted = v[0].value;
                                                break;
                                            }
                                        };
                                    });

                                    resolve(posts);
                                    return;


                                }, function(err) {
                                    reject(err);
                                    return;
                                });

                            } else {
                                resolve(posts);
                                return;
                            }
                        });
                    };

                    getVotedOnPosts(posts, userId).then(function(posts) {

                        for (var i = 0; i < posts.length; i++) {
                            promises.push(getReplys(posts[i].id, userId));
                            fullForums.push({post: posts[i], user: {}, replys: []});
                        }

                        Promise.all(promises).then(function(replys) {
                            replys.forEach((group) => {
                                group.forEach((reply) => {
                                    fullForums[reply.post].replys.push(reply);
                                });
                            });

                            promises = [];

                            Object.keys(fullForums).forEach((f) => {
                                promises.push(db.rowsByField("users", "id", fullForums[f].post.user));
                            });

                            Promise.all(promises).then(function(users) {

                                var subjects = [];

                                users.forEach(function(u) {
                                    Object.keys(fullForums).forEach((f) => {
                                        if (fullForums[f].post.user == u[0].id) {
                                            fullForums[f].user = {
                                                id: u[0].id,
                                                username: u[0].username,
                                                image: u[0].image
                                            };
                                        }
                                        if (!subjects.includes(fullForums[f].post.subject)) {
                                            subjects.push(fullForums[f].post.subject);
                                        }
                                    });
                                });

                                resolve({fullForums, subjects, current: "all"});
                                return;

                            }, function(err) {
                                reject(err);
                                return;
                            });

                        }, function(err) {
                            reject(err);
                            return;

                        });

                    }, function(err) {
                        reject(err);
                        return;
                    });

                    return;
                }, function(err) {
                    reject("unable to get all posts: "+err);
                    return;
                });
            });
        };


        return {
            newPost:function(userId, title, body, subject){
                return newPost(db, userId, title, body, subject);
            },
            newReply:function(postId, userId, body, parent){
                return newReply(db, postId, userId, body, parent);
            },
            getForumsByUser:function(userId){
                return getForumsByUser(db, userId);
            },
            getForumsBySubject:function(subject, sort, userId){
                return getForumsBySubject(db, subject, sort, userId);
            },
            getAllPosts:function(sort, userId){
                return getAllPosts(db, sort, userId);
            },
            getPost:function(postId, userId){
                return getPost(db, postId, userId);
            },
            increaseVote:function(post, table, userId) {
                return increaseVote(db, post, table, userId);
            },
            decreaseVote:function(post, table, userId) {
                return decreaseVote(db, post, table, userId);
            },
        }

    }());
}
