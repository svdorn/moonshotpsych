var express = require('express');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var logger = require('morgan');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const credentials = require('./credentials');
var bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const sanitizeHtml = require('sanitize-html');
const fileUpload = require('express-fileupload');


var app = express();

// view engine setup
//app.set('views', path.join(__dirname, 'views'));
//app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(fileUpload());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
// trust the first proxy encountered because we run through a proxy
app.set('trust proxy', 1);

// APIs
var mongoose = require('mongoose');
// MONGO LAB
const dbConnectLink = 'mongodb://' + credentials.dbUsername + ':' + credentials.dbPassword + '@ds141159-a0.mlab.com:41159,ds141159-a1.mlab.com:41159/moonshot?replicaSet=rs-ds141159';
mongoose.connect(dbConnectLink);

var db = mongoose.connection;
db.on('error', console.error.bind(console, '# MongoDB - connection error: '));


var Users = require('./models/users.js');
var Employers = require('./models/employers.js');
var Businesses = require('./models/businesses.js');
var Pathways = require('./models/pathways.js');
var Articles = require('./models/articles.js');
var Videos = require('./models/videos.js');
var Quizzes = require('./models/quizzes.js');
var Links = require('./models/links.js');
var Info = require('./models/info.js');
var Emailaddresses = require('./models/emailaddresses.js');
var Referrals = require('./models/referrals.js');


// get helper functions
const { sanitize,
        removeEmptyFields,
        verifyUser,
        removePassword,
        getUserByQuery,
        sendEmail,
        safeUser,
        userForAdmin,
        getFirstName,
        printUsersFromPathway
} = require('./apis/helperFunctions.js');


// import all the api functions
const userApis = require('./apis/userApis');
const candidateApis = require('./apis/candidateApis');
const businessApis = require('./apis/businessApis');
const employerApis = require('./apis/employerApis');
const adminApis = require('./apis/adminApis');
const miscApis = require('./apis/miscApis');


// set up the session
app.use(session({
    secret: credentials.secretString,
    saveUninitialized: false, // doesn't save a session if it is new but not modified
    rolling: true, // resets maxAge on session when user uses site again
    proxy: true, // must be true since we are using a reverse proxy
    resave: false, // session only saved back to the session store if session was modified,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days in milliseconds
        // evaluates to true if in production, false if in development (i.e. NODE_ENV not set)
        secure: !!process.env.NODE_ENV // only make the cookie if accessing via https
    },
    store: new MongoStore({mongooseConnection: db, ttl: 7 * 24 * 60 * 60})
    // ttl: 7 days * 24 hours * 60 minutes * 60 seconds
}));


app.post('/user/signOut', userApis.POST_signOut);

app.post("/user/keepMeLoggedIn", userApis.POST_keepMeLoggedIn);
app.get("/user/keepMeLoggedIn", userApis.GET_keepMeLoggedIn);

app.get('/user/session', userApis.GET_session);
app.post('/user/session', userApis.POST_session);

// POST NEW CANDIDATE
app.post('/candidate/candidate', candidateApis.POST_candidate);
app.post("/candidate/endOnboarding", candidateApis.POST_endOnboarding);

app.post('/user/verifyEmail', userApis.POST_verifyEmail);
app.post('/user/changePasswordForgot', userApis.POST_changePasswordForgot);



// NEED TO TEST
app.post('/candidate/sendVerificationEmail', candidateApis.POST_sendVerificationEmail);
app.post('/candidate/completePathway', candidateApis.POST_completePathway);
app.post("/candidate/addPathway", candidateApis.POST_addPathway);

app.post('/business/forBusinessEmail', businessApis.POST_forBusinessEmail);

app.post("/admin/alertLinkClicked", adminApis.POST_alertLinkClicked);

app.post('/user/changePassword', userApis.POST_changePassword);

app.post('/misc/createReferralCode', miscApis.POST_createReferralCode);


app.post('/user/unsubscribeEmail', function (req, res) {

    let recipient = ["kyle@moonshotlearning.org"];
    let subject = 'URGENT ACTION - User Unsubscribe from Moonshot';
    let content = "<div>"
        + "<h3>This email is Unsubscribing from Moonshot Emails:</h3>"
        + "<p>Email: "
        + sanitize(req.body.email)
        + "</p>"
        + "</div>";

    const sendFrom = "Moonshot";
    sendEmail(recipient, subject, content, sendFrom, undefined, function (success, msg) {
        if (success) {
            res.json("You have successfully unsubscribed.");
        } else {
            res.status(500).send(msg);
        }
    });

    const optOutError = function(error) {
        console.log("ERROR ADDING EMAIL TO OPT OUT LIST: " + req.body.email);
        console.log("The error was: ", error);
        let recipient = ["ameyer24@wisc.edu"];
        let subject = "MOONSHOT - URGENT ACTION - User was not unsubscribed"
        let content = "<div>"
            + "<h3>This email could not be added to the optOut list:</h3>"
            + "<p>Email: "
            + sanitize(req.body.email)
            + "</p>"
            + "</div>";
        sendEmail(recipient, subject, content, sendFrom, undefined, function(){});
    }

    // add email to list of unsubscribed emails
    Emailaddresses.findOne({name: "optedOut"}, function(err, optedOut) {
        if (err) {
            optOutError(err);
        }
        else {
            console.log("adding to opted-out list: ", req.body.email)
            optedOut.emails.push(req.body.email);
            optedOut.save(function(err2, newOptedOut) {
                if (err2) {
                    optOutError(err2);
                }
            });
        }
    });
});


// SEND COMING SOON EMAIL
app.post('/user/comingSoonEmail', function (req, res) {

    let recipient = ["kyle@moonshotlearning.org", "justin@moonshotlearning.org", "ameyer24@wisc.edu"];
    let subject = 'Moonshot Coming Soon Pathway';
    let content = "<div>"
        + "<h3>Pathway:</h3>"
        + "<p>Name: "
        + sanitize(req.body.name)
        + "<p>Email: "
        + sanitize(req.body.email)
        + "</p>"
        + "<p>Pathway: "
        + sanitize(req.body.pathway)
        + "</p>"
        + "</div>";

    const sendFrom = "Moonshot";
    sendEmail(recipient, subject, content, sendFrom, undefined, function (success, msg) {
        if (success) {
            res.json("Email sent successfully, our team will be in contact with you shortly!");
        } else {
            res.status(500).send(msg);
        }
    })
});

// SEND EMAIL FOR CONTACT US
app.post('/user/contactUsEmail', function (req, res) {

    let message = "None";
    if (req.body.message) {
        message = sanitize(req.body.message);
    }
    let recipients = ["kyle@moonshotlearning.org", "justin@moonshotlearning.org"];
    let subject = 'Moonshot Pathway Question -- Contact Us Form';
    let content = "<div>"
        + "<h3>Questions from pathway:</h3>"
        + "<p>Name: "
        + sanitize(req.body.name)
        + "</p>"
        + "<p>Email: "
        + sanitize(req.body.email)
        + "</p>"
        + "<p>Message: "
        + message
        + "</p>"
        + "</div>";

    const sendFrom = "Moonshot";
    sendEmail(recipients, subject, content, sendFrom, undefined, function (success, msg) {
        if (success) {
            res.json("Email sent successfully, our team will be in contact with you shortly!");
        } else {
            res.status(500).send(msg);
        }
    })
});

// SEND EMAIL FOR PASSWORD RESET
app.post('/forgotPassword', function (req, res) {

    let email = sanitize(req.body.email);
    let query = {email: email};

    const user = getUserByQuery(query, function (err, user) {
        if (!user) {
            console.log("Couldn't find user to set their password change token.");
            res.status(401).send("Cannot find user");
            return;
        } else {
            // token that will go in the url
            const newPasswordToken = crypto.randomBytes(64).toString('hex');
            // password token expires in one hour (minutes * seconds * milliseconds)
            const newTime = Date.now() + (60 * 60 * 1000);

            const query2 = {_id: user._id};
            const update = {
                '$set': {
                    passwordToken: newPasswordToken,
                    passwordTokenExpirationTime: newTime,
                }
            };

            const options = {new: true};

            Users.findOneAndUpdate(query2, update, options, function (err, foundUser) {
                if (err) {
                    console.log("Error giving user reset-password token: ", err);
                    res.status(500).send("Server error, try again later.");
                    return;
                }

                // if we're in development (on localhost) navigate to localhost
                let moonshotUrl = "https://www.moonshotlearning.org/";
                if (!process.env.NODE_ENV) {
                    moonshotUrl = "http://localhost:8081/";
                }
                const recipient = [user.email];
                const subject = 'Change Password';

                const content =
                    '<div style="font-size:15px;text-align:center;font-family: Arial, sans-serif;color:#686868">'
                        + '<a href="' + moonshotUrl + '" style="color:#00c3ff"><img alt="Moonshot Logo" style="height:100px;margin-bottom:20px"src="https://image.ibb.co/iAchLn/Official_Logo_Blue.png"/></a><br/>'
                            + '<div style="text-align:justify;width:80%;margin-left:10%;">'
                            + "<span style='margin-bottom:20px;display:inline-block;'>Hello! We got a request to change your password. If that wasn't from you, you can ignore this email and your password will stay the same. Otherwise click here:</span><br/>"
                            + '</div>'
                        + '<a style="display:inline-block;height:28px;width:170px;font-size:18px;border:2px solid #00d2ff;color:#00d2ff;padding:10px 5px 0px;text-decoration:none;margin:5px 20px 20px;" href="' + moonshotUrl + 'changePassword?token='
                        + newPasswordToken
                        + '">Change Password</a>'
                        + '<div style="text-align:left;width:80%;margin-left:10%;">'
                            + '<div style="font-size:10px; text-align:center; color:#C8C8C8; margin-bottom:30px;">'
                                + '<i>Moonshot Learning, Inc.<br/><a href="" style="text-decoration:none;color:#D8D8D8;">1261 Meadow Sweet Dr<br/>Madison, WI 53719</a>.<br/>'
                                + '<a style="color:#C8C8C8; margin-top:20px;" href="' + moonshotUrl + 'unsubscribe?email=' + user.email + '">Opt-out of future messages.</a></i>'
                            + '</div>'
                        + '</div>'
                    + '</div>';

                const sendFrom = "Moonshot";
                sendEmail(recipient, subject, content, sendFrom, undefined, function (success, msg) {
                    if (success) {
                        res.json(msg);
                    } else {
                        res.status(500).send(msg);
                    }
                })
            });
        }
    })
});



app.post('/getUserById', function (req, res) {
    const _id = sanitize(req.body._id);
    const query = {_id};
    getUserByQuery(query, function (err, user) {
        if (err) {
            res.status(500).send("User not found.");
        } else {
            res.json(safeUser(user));
        }
    })
});

app.post('/getUserByProfileUrl', function (req, res) {
    const profileUrl = sanitize(req.body.profileUrl);
    const query = { profileUrl };
    getUserByQuery(query, function (err, user) {
        res.json(safeUser(user));
    })
});


// LOGIN USER
app.post('/login', function (req, res) {
    const reqUser = sanitize(req.body.user);
    let saveSession = sanitize(req.body.saveSession);

    if (typeof saveSession !== "boolean") {
        saveSession = false;
    }
    var email = reqUser.email;
    var password = reqUser.password;

    let user = null;

    // searches for user by case-insensitive email
    const emailRegex = new RegExp(email, "i");
    var query = {email: emailRegex};
    Users.findOne(query, function (err, foundUser) {
        if (err) {
            res.status(500).send("Error performing query to find user in db. ", err);
            return;
        }

        // the code that executes once a user is found in the db
        let tryLoggingIn = function() {
            bcrypt.compare(password, user.password, function (passwordError, passwordsMatch) {
                // if hashing password fails
                if (passwordError) {
                    res.status(500).send("Error logging in, try again later.");
                    return;
                }
                // passwords match
                else if (passwordsMatch) {
                    // check if user verified email address
                    if (user.verified) {
                        user = removePassword(user);
                        if (saveSession) {
                            req.session.userId = user._id;
                            req.session.save(function (err) {
                                if (err) {
                                    console.log("error saving user session", err);
                                }
                                res.json(removePassword(user));
                            });
                        } else {
                            res.json(removePassword(user));
                            return;
                        }
                    }
                    // if user has not yet verified email address, don't log in
                    else {
                        res.status(401).send("Email not yet verified");
                        return;
                    }
                }
                // wrong password
                else {
                    res.status(400).send("Password is incorrect.");
                    return;
                }
            });
        }

        // CHECK IF A USER WAS FOUND
        if (!foundUser || foundUser == null) {
            // CHECK IF THE USER IS IN THE BUSINESS USER DB
            Employers.findOne(query, function(err2, foundEmployer) {
                if (err2) {
                    res.status(500).send("Error performing query to find user in business user db. ", err);
                    return;
                }

                if (!foundEmployer || foundEmployer == null) {
                    console.log('looked in business db, none found')
                    res.status(404).send("No user with that email was found.");
                    return;
                }

                user = foundEmployer;
                tryLoggingIn();
                return;
            });
        }
        // USER FOUND IN USER DB
        else {
            user = foundUser;
            tryLoggingIn();
            return;
        }


    });
});


//----->> DELETE USER <<------
app.delete('/user/:_id', function (req, res) {
    var query = {_id: sanitize(req.params._id)};

    Users.remove(query, function (err, user) {
        if (err) {
            console.log(err);
        }
        res.json(safeUser(user));
    })
});

//----->> UPDATE USER <<------
app.post('/user/changeSettings', function (req, res) {
    const user = sanitize(req.body);
    const password = user.password;

    if (!user.password || !user.name || !user.email) {
        console.log("Not all arguments provided for settings change.");
        res.status(400).send("No fields can be empty.");
        return;
    }

    const userQuery = {_id: user._id}

    Users.findOne(userQuery, function(findUserErr, foundUser) {
        // if error while trying to find current user
        if (findUserErr) {
            console.log("Error finding user in db when trying to update settings: ", findUserErr);
            res.status(500).send("Settings couldn't be updated. Try again later.");
            return;
        }

        if (!foundUser) {
            console.log("Didn't find a user with given id when trying to update settings.");
            res.status(500).send("Settings couldn't be updated. Try again later.");
            return;
        }

        bcrypt.compare(password, foundUser.password, function (passwordError, passwordsMatch) {
            // error comparing password to user's password, doesn't necessarily
            // mean that the password is wrong
            if (passwordError) {
                console.log("Error comparing passwords when trying to update settings: ", passwordError);
                res.status(500).send("Settings couldn't be updated. Try again later.");
                return;
            }

            // user entered wrong password
            if (!passwordsMatch) {
                res.status(400).send("Incorrect password");
                return;
            }

            // see if there's another user with the new email
            const emailQuery = {email: user.email};
            Users.findOne(emailQuery, function(emailQueryErr, userWithEmail) {
                // don't want two users with the same email, so in case of db search
                // failure, return unsuccessfully
                if (emailQueryErr) {
                    console.log("Error trying to find a user with the same email address as the one provided by user trying to change settings: ", emailQueryErr);
                    res.status(500).send("Settings couldn't be updated. Try again later.");
                    return;
                }

                // someone else already has that email
                if (userWithEmail && userWithEmail._id.toString() != foundUser._id.toString()) {
                    res.status(400).send("That email address is already taken.");
                    return;
                }

                // all is good, update the user (as long as email and name are not blank)
                if (user.email) {
                    foundUser.email = user.email;
                }
                if (user.name) {
                    foundUser.name = user.name;
                }
                if (typeof user.hideProfile === "boolean") {
                    foundUser.hideProfile = user.hideProfile;
                }

                console.log("hideProfile: ", user.hideProfile);

                foundUser.save(function(saveErr, newUser) {
                    // if there is an error saving the user's info
                    if (saveErr) {
                        console.log("Error when saving user's changed info: ", saveErr);
                        res.status(500).send("Settings couldn't be updated. Try again later.");
                        return;
                    }

                    console.log("newUser: ", newUser);

                    // settings change successful
                    res.json(newUser);
                })
            });
        });
    })
});




//----->> GET TOP PATHWAYS <<------
app.get('/topPathways', function (req, res) {
    const numPathways = parseInt(sanitize(req.query.numPathways), 10);

    // gets the most popular pathways, the number of pathways is numPathways;
    // only show the ones that are ready for users to see
    Pathways.find({showToUsers: true})
        .sort({avgRating: 1})
        .limit(numPathways)
        .select("name previewImage sponsor estimatedCompletionTime deadline price comingSoon showComingSoonBanner url")
        .exec(function (err, pathways) {
            if (err) {
                res.status(500).send("Not able to get top pathways");
            } else if (pathways.length == 0) {
                res.status(500).send("No pathways found");
            } else {
                res.json(pathways);
            }
        });
});

//----->> GET LINK BY ID <<-----
app.get('/getLink', function (req, res) {
    const _id = sanitize(req.query._id);
    const query = {_id: _id};

    Links.findOne(query, function (err, link) {
        if (err) {
            console.log("error in get link by id")
        } else {
            res.json(link);
        }

    })
});

//----->> GET ARTICLE BY ID <<-----
app.get('/getArticle', function (req, res) {
    const _id = sanitize(req.query._id);
    const query = {_id: _id};

    Articles.findOne(query, function (err, article) {
        if (err) {
            console.log("error in get article by id")
        } else {
            res.json(article);
        }

    })
});


//----->> GET ARTICLE BY ID <<-----
app.get('/getPathwayInfo', function (req, res) {
    const _id = sanitize(req.query._id);
    const query = {_id: _id};

    Info.findOne(query, function (err, info) {
        if (err) {
            console.log("error in get article by id")
        } else {
            res.json(info);
        }

    })
});


//----->> GET QUIZ BY ID <<-----
app.get('/getQuiz', function (req, res) {
    const _id = sanitize(req.query._id);
    const query = {_id: _id};

    Quizzes.findOne(query, function (err, quiz) {
        if (err) {
            console.log("error in get quiz by id")
            res.status(404).send("Quiz not found");
        } else {
            if (quiz != null) {
                quiz.correctAnswerNumber = undefined;
            }
            res.json(quiz);
        }

    })
});

//----->> GET VIDEO BY ID <<-----
app.get('/getVideo', function (req, res) {
    const _id = sanitize(req.query._id);
    const query = {_id: _id};

    Videos.findOne(query, function (err, link) {
        if (err) {
            console.log("error in get video by id")
        } else {
            res.json(link);
        }

    })
});

//----->> GET PATHWAY BY ID <<-----
app.get('/pathwayByIdNoContent', function (req, res) {
    const _id = sanitize(req.query._id);
    const query = {_id: _id};

    Pathways.findOne(query, function (err, pathway) {
        if (err) {
            console.log("error in get pathway by id")
        } else {
            if (pathway) {
                res.json(removeContentFromPathway(pathway));
            } else {
                res.json(undefined);
            }
        }

    })
});

//----->> GET PATHWAY BY URL <<-----
app.get('/pathwayByPathwayUrlNoContent', function (req, res) {
    const pathwayUrl = sanitize(req.query.pathwayUrl);
    const query = {url: pathwayUrl};

    Pathways.findOne(query, function (err, pathway) {
        if (err) {
            console.log("error in get pathway by url")
        } else if (pathway) {
            res.json(removeContentFromPathway(pathway));
        } else {
            res.status(404).send("No pathway found");
        }

    })
});

app.get('/pathwayByPathwayUrl', function (req, res) {
    const pathwayUrl = sanitize(req.query.pathwayUrl);
    const userId = sanitize(req.query.userId);
//    const hashedVerificationToken = req.query.hashedVerificationToken;

    const verificationToken = sanitize(req.query.verificationToken);
    const query = {url: pathwayUrl};

    Pathways.findOne(query, function (err, pathway) {
        if (err) {
            console.log("error in get pathway by url");
            res.status(404).send("Error getting pathway by url");
            return;
        } else if (pathway) {
            // get the user from the database, can't trust user from frontend
            // because they can change their info there
            Users.findOne({_id: userId}, function (err, user) {
                if (err) {
                    console.log("error getting user: ", err);
                    res.status(500).send("Error getting pathway");
                    return;
                } else {
                    // check that user is who they say they are
                    if (verifyUser(user, verificationToken)) {
                        // check that user has access to that pathway
                        const hasAccessToPathway = user.pathways.some(function (path) {
                            return pathway._id.toString() == path.pathwayId.toString();
                        })
                        if (hasAccessToPathway) {
                            res.json(pathway);
                            return;
                        } else {
                            res.status(403).send("User does not have access to this pathway.");
                            return;
                        }
                    } else {
                        console.log("verification token does not match")
                        res.status(403).send("Incorrect user credentials");
                        return;
                    }
                }
            })
        } else {
            res.status(404).send("No pathway found");
        }

    })
});


function removeContentFromPathway(pathway) {
    if (pathway) {
        steps = pathway.steps;
        if (steps) {
            for (let i = 0; i < steps.length; i++) {
                steps[i].substeps = undefined;
            }
            pathway.steps = steps;
        }
    }

    return pathway;
}

//----->> SEARCH PATHWAYS <<------
app.get('/pathways/search', function (req, res) {
    const MAX_PATHWAYS_TO_RETURN = 1000;
    let query = {showToUsers: true};

    let term = sanitize(req.query.searchTerm);
    if (term && term !== "") {
        // if there is a search term, add it to the query
        const termRegex = new RegExp(term, "i");
        query["name"] = termRegex;
    }

    let limit = parseInt(sanitize(req.query.limit), 10);
    if (limit === NaN) {
        limit = MAX_PATHWAYS_TO_RETURN;
    }
    const sortNOTYET = sanitize(req.body.sort);

    // add category to query if it exists
    const category = sanitize(req.query.category);
    if (category && category !== "") {
        query["tags"] = category;
    }

    // add company to query if it exists
    const company = sanitize(req.query.company);
    if (company && company !== "") {
        query["sponsor.name"] = company;
    }

    //const limit = 4;
    const sort = {avgRating: 1};
    // only get these properties of the pathways
    const select = "name previewImage sponsor estimatedCompletionTime deadline price tags comingSoon showComingSoonBanner url";

    Pathways.find(query)
        .limit(limit)
        .sort(sort)
        .select(select)
        .exec(function (err, pathways) {
            console.log("pathways: ", pathways);
            if (err) {
                res.status(500).send("Error getting searched-for pathways");
            } else {
                res.json(pathways);
            }
        });
});


app.get("/pathways/getAllCompaniesAndCategories", function(req, res) {
    Pathways.find()
    .select("sponsor.name tags")
    .exec(function(err, pathways) {
        if (err) {
            console.log("Error finding pathways when getting all companies and categories.");
            res.json({companies: [], categories: []});
        } else if (!pathways) {
            res.json({companies: [], categories: []});
        } else {
            let companies = [];
            let categories = [];

            // go through each pathway, add the sponsor name and tags to the lists
            pathways.forEach(function(pathway) {
                // only add tags and company names if they exist
                if (pathway && pathway.sponsor && pathway.sponsor.name) {
                    companies.push(pathway.sponsor.name);
                }
                if (pathway && pathway.tags) {
                    categories = categories.concat(pathway.tags);
                }
            })

            companies = removeDuplicates(companies);
            categories = removeDuplicates(categories);
            res.json({companies, categories})
        }
    });
});


// DOES NOT WORK FOR REMOVING DUPLICATE OBJECTS, ONLY STRINGS/INTS
function removeDuplicates(a) {
    // the hash object
    let seen = {};
    // array to be returned
    let out = [];
    // length of array to be checked
    const len = a.length;
    // position in array to be returned
    let j = 0;
    // go through each element in the given array
    for(let i = 0; i < len; i++) {
        // the item in the given array
        const item = a[i];
        // if seen[item] === 1, we have seen it before
        if(seen[item] !== 1) {
            // we haven't seen the item before, so mark it seen...
            seen[item] = 1;
            // ...and add it to the list to be returned
            out[j++] = item;
        }
    }
    // return the new duplicate-free array
    return out;
}


// VERIFY THAT THE GIVEN USER IS AN ADMIN FROM USER ID AND VERIFICATION TOKEN
function verifyAdmin(userId, verificationToken) {
    // async call, lets us use await
    return new Promise((resolve, reject) => {
        Users.findById(userId, function(findUserErr, foundUser) {
            // db error finding the user
            if (findUserErr) {
                console.log("Error finding admin user by id: ", findUserErr);
                resolve(false);
            }
            // no user found with that id, so can't be an admin user
            else if (!foundUser) {
                resolve(false);
            }
            // user found
            else {
                // wrong verification token, user does not have valid credentials
                if (foundUser.verificationToken != verificationToken) {
                    console.log("Someone tried to get verify an admin user with the wrong verification token. User is: ", foundUser);
                    resolve(false);
                }
                // return whether the user is an admin
                else {
                    resolve(foundUser.admin);
                }
            }
        });
    });
}


// VERIFY THAT THE GIVEN USER IS LEGIT AND PART OF THE GIVEN BUSINESS
// RETURNS THE BUSINESS THAT THE EMPLOYER WORKS FOR ON SUCCESS, UNDEFINED ON FAIL
async function verifyEmployerAndReturnBusiness(userId, verificationToken, businessId) {
    return new Promise(async (resolve, reject) => {
        try {
            // function to print the info that was given; for when errors occur
            const printInfo = () => {
                console.log("Given userId: ", userId);
                console.log("Given verificationToken: ", verificationToken);
                console.log("Given businessId: ", businessId);
            }

            // if the arguments provided are invalid, cannot validate user
            if (typeof userId !== "string" || typeof verificationToken !== "string" || typeof businessId !== "string") {
                console.log("Employer could not be verified.");
                printInfo();
                resolve(undefined);
                return;
            }

            // set to true once we've verified the user is real and has the right
            // verification token
            let verifiedUser = false;
            // set to true once we've verified the user is employed by the
            // business they say they are
            let verifiedPosition = false;
            // the business found in the db, returned on success
            let business = undefined;

            // find the employer by the given id
            Employers.findById(userId)
            .then(foundEmployer => {
                // if employer couldn't be found from the given id
                if (!foundEmployer) {
                    console.log("Couldn't find employer in the database when trying to verify them.");
                    printInfo();
                    resolve(undefined);
                    return;
                }
                // make sure the employer has the right verification token
                if (foundEmployer.verificationToken !== verificationToken) {
                    console.log("Employer gave wrong verification token when trying to be verified.");
                    printInfo();
                    resolve(undefined);
                    return;
                }
                // employer is real, return successfully if position in company verified
                verifiedUser = true;
                if (verifiedPosition) {
                    console.log("returning true");
                    resolve(business);
                    return;
                }
            })
            .catch(findEmployerErr => {
                console.log("Error finding employer in db when trying to verify employer: ", findEmployerErr);
                printInfo();
                resolve(undefined);
                return;
            })


            // make sure the employer is in the business' employer id array
            Businesses.findById(businessId)
            .then(foundBusiness => {
                if (!foundBusiness) {
                    console.log("Did not find business when trying to verify employer.");
                    printInfo();
                    resolve(undefined);
                    return;
                }

                // try to find employer in business' employer id array
                const employerWorksForBusiness = foundBusiness.employerIds.some(employerId => {
                    // userId is that of the user we are trying to verify
                    return employerId.toString() === userId;
                });

                // employer did not exist within the business' employers array
                if (!employerWorksForBusiness) {
                    console.log("Employer did not exist within the business' employers array (they don't work for that company).");
                    printInfo();
                    resolve(undefined);
                    return;
                }

                // employer does work for this company, return successfully if they are verified
                verifiedPosition = true;
                business = foundBusiness
                if (verifiedUser) {
                    console.log("returning true");
                    resolve(business);
                    return;
                }
            })
            .catch(findBusinessErr => {
                console.log("Error finding business in db when trying to verify employer: ", findBusinessErr);
                printInfo();
                resolve(undefined);
                return;
            });
        }
        // some error, probably in the database, so employer can't be verified
        catch (error) {
            console.log("Error verifying employer: ", error);
            resolve(undefined);
            return;
        }
    });
}


app.get("/infoForAdmin", function(req, res) {
    const query = sanitize(req.query);
    const _id = query.userId;
    const verificationToken = query.verificationToken;

    if (!_id || !verificationToken) {
        console.log("No user id or verification token for user trying to get admin info.");
        res.status(403).send("User does not have valid credentials.");
        return;
    }

    const adminQuery = { _id, verificationToken };

    Users.findOne(adminQuery, function(err, user) {
        if (err) {
            console.log("Error finding admin user: ", err);
            res.status(500).send("Error finding current user in db.");
            return;
        } else if (!user || !user.admin || !(user.admin === "true" || user.admin === true) ) {
            res.status(403).send("User does not have valid credentials.");
            return;
        } else {
            Users.find()
                .sort({name: 1})
                .select("name email profileUrl")
                .exec(function (err2, users) {
                    if (err2) {
                        res.status(500).send("Not able to get users for admin.");
                        return;
                    } else if (users.length == 0) {
                        res.status(500).send("No users found for admin.");
                        return;
                    } else {
                        res.json(users);
                        return;
                    }
                });
        }
    });
});


app.get("/userForAdmin", function(req, res) {
    const query = sanitize(req.query);
    const _id = query.adminUserId;
    const verificationToken = query.verificationToken;
    const profileUrl = query.profileUrl;

    if (!_id || !verificationToken) {
        console.log("No user id or verification token for user trying to get admin info.");
        res.status(403).send("User does not have valid credentials.");
        return;
    }

    if (!profileUrl) {
        console.log("No user info requested.");
        res.status(400).send("No user info requested.");
        return;
    }

    const adminQuery = { _id, verificationToken };

    Users.findOne(adminQuery, function(err, adminUser) {
        if (err) {
            console.log("Error finding admin user: ", err);
            res.status(500).send("Error finding current user in db.");
            return;
        } else if (!adminUser || !adminUser.admin || !(adminUser.admin === "true" || adminUser.admin === true) ) {
            res.status(403).send("User does not have valid credentials.");
            return;
        } else {
            Users.findOne({profileUrl}, function(error, user) {
                if (error) {
                    console.log("Error getting user for admin: ", error);
                    res.status(500).send("Error getting user for admin.");
                    return;
                } else if (!user) {
                    console.log("User not found when trying to find user for admin.");
                    res.status(404).send("User not found.");
                    return;
                } else {
                    // have the user, now have to get their pathways to return

                    let pathways = [];
                    let completedPathways = [];
                    let foundPathways = 0;
                    let foundCompletedPathways = 0;

                    // quizzes will look like
                    // { <subStepId>: quizObject, ... }
                    let quizzes = {};
                    let requiredNumQuizzes = 0;
                    let foundQuizzes = 0;

                    // scores will be an object with every question with an objective answer
                    // scores[questionId] will be true if the answer is correct
                    // false if the answer is incorrect
                    let scores = {}

                    let returnIfFoundEverything = function() {
                        // if we have found all of the pathways, return all the info to the front end
                        if (foundPathways === user.pathways.length && foundCompletedPathways === user.completedPathways.length && foundQuizzes === requiredNumQuizzes) {
                            // grade the user's answers
                            // console.log("quizzes: ", quizzes);
                            // console.log("user.answers: ", user.answers);
                            for (let questionId in quizzes) {
                                let quiz = quizzes[questionId];
                                // skip anything that is not a quiz
                                if (!quizzes.hasOwnProperty(questionId)) { continue; }

                                // if the user answered the question and the question has a correct answer, grade it
                                if (quiz.hasCorrectAnswers && user.answers[questionId]) {
                                    // if it's a multiple choice question
                                    if (quiz.questionType === "multipleChoice" || quiz.questionType === "twoOptions") {
                                        // get the answer value the user put in
                                        let userAnswerValue = user.answers[questionId].value;
                                        let isCorrect = false;
                                        // if there is an array of correct answers
                                        if (Array.isArray(quiz.correctAnswerNumber)) {
                                            // see if the answer value the user put in is one of the right answers
                                            isCorrect = quiz.correctAnswerNumber.some(function(answerNumber) {
                                                // return true if the answer value is a correct one
                                                return answerNumber === userAnswerValue;
                                            })
                                        }
                                        // if there is a single correct answer
                                        else {
                                            isCorrect = quiz.correctAnswerNumber == userAnswerValue;
                                        }

                                        scores[questionId] = isCorrect;
                                    }
                                }
                            }

                            res.json({
                                user: userForAdmin(user),
                                pathways,
                                completedPathways,
                                quizzes,
                                scores
                            });
                            return;
                        }
                    }

                    let getQuizzesFromPathway = function(path) {
                        if (path && path.steps) {
                            // find quizzes that go with this pathway
                            for (let stepIndex = 0; stepIndex < path.steps.length; stepIndex++) {
                                let step = path.steps[stepIndex];
                                for (let subStepIndex = 0; subStepIndex < step.subSteps.length; subStepIndex++) {
                                    let subStep = step.subSteps[subStepIndex];
                                    if (subStep.contentType === "quiz") {
                                        // new quiz found, have to retrieve it before returning
                                        requiredNumQuizzes++;

                                        Quizzes.findOne({_id: subStep.contentID}, function(quizErr, quiz) {
                                            foundQuizzes++;
                                            if (quizErr) {
                                                console.log("Error getting question: ", quizErr);
                                            } else {
                                                quizzes[subStep.contentID] = quiz;
                                            }

                                            returnIfFoundEverything();
                                        })
                                    }
                                }
                            }
                        }
                    }

                    // if the user has no pathways or completed pathways, return simply their info
                    if (user.pathways.length === 0 && user.completedPathways.lengh === 0) {
                        res.json({
                            user: userForAdmin(user),
                            pathways,
                            completedPathways
                        });
                        return;
                    }

                    for (let pathwaysIndex = 0; pathwaysIndex < user.pathways.length; pathwaysIndex++) {
                        Pathways.findOne({_id: user.pathways[pathwaysIndex].pathwayId}, function(pathErr, path) {
                            if (pathErr) {
                                console.log(pathErr);
                            }
                            pathways.push(path);
                            // mark that we have found another pathway
                            foundPathways++;

                            getQuizzesFromPathway(path);





                            // if we have found all of the pathways, return all the info to the front end
                            // if (foundPathways === user.pathways.length && foundCompletedPathways === user.completedPathways.length && foundQuizzes === requiredNumQuizzes) {
                            //     res.json({
                            //         user: userForAdmin(user),
                            //         pathways,
                            //         completedPathways
                            //     });
                            //     return;
                            // }
                            returnIfFoundEverything();
                        })
                    }

                    for (let completedPathwaysIndex = 0; completedPathwaysIndex < user.completedPathways.length; completedPathwaysIndex++) {
                        Pathways.findOne({_id: user.completedPathways[completedPathwaysIndex].pathwayId}, function(pathErr, path) {
                            if (pathErr) {
                                console.log(pathErr);
                            }
                            completedPathways.push(path);
                            // mark that we have found another pathway
                            foundCompletedPathways++;

                            getQuizzesFromPathway(path);

                            returnIfFoundEverything();
                            // if we have found all of the pathways, return all the info to the front end
                            // if (foundPathways === user.pathways.length && foundCompletedPathways === user.completedPathways.length && foundQuizzes === requiredNumQuizzes) {
                            //     res.json({
                            //         user: userForAdmin(user),
                            //         pathways,
                            //         completedPathways
                            //     });
                            //     return;
                            // }
                        })
                    }
                }
            });
        }
    });
});


app.post("/userCurrentStep", function (req, res) {
    const userId = sanitize(req.body.params.userId);
    const pathwayId = sanitize(req.body.params.pathwayId);
    const stepNumber = sanitize(req.body.params.stepNumber);
    const subStepNumber = sanitize(req.body.params.subStepNumber);
    const verificationToken = sanitize(req.body.params.verificationToken);

    Users.findById(userId, function (err, user) {
        if (!verifyUser(user, verificationToken)) {
            res.status(401).send("User does not have valid credentials to save step.");
            return;
        }

        let pathwayIndex = user.pathways.findIndex(function (path) {
            return path.pathwayId == pathwayId;
        });
        user.pathways[pathwayIndex].currentStep = {
            subStep: subStepNumber,
            step: stepNumber
        }
        user.save(function () {
            res.json(true);
        });
    })
        .catch(function (err) {
            console.log("error saving the current step, ", err);
        })
});

app.get("/infoByUserId", function (req, res) {
    infoType = sanitize(req.query.infoType);
    const userId = sanitize(req.query.userId);

    if (userId && infoType) {
        Users.findById(userId, function (err, user) {
            if (err) {
                res.status(500).send("Could not get user");
            } else {
                // if the user doesn't have info saved in db, return empty array
                if (!user.info) {
                    res.json([]);
                }
                res.json(user.info[infoType]);
            }
        });
    } else {
        res.send(undefined);
    }
});


app.post("/updateAnswer", function (req, res) {
    let params, userId, verificationToken, quizId, answer;
    try {
        // get all the parameters
        params = sanitize(req.body.params);
        userId = params.userId;
        verificationToken = params.verificationToken;
        quizId = params.quizId;
        answer = params.answer;
    } catch (e) {
        res.status(400).send("Wrong request format.");
        return;
    }

    Users.findById(userId, function (findErr, user) {
        if (findErr) {
            console.log("Error finding user by id when trying to update answer: ", findErr);
            res.status(404).send("Current user not found.");
            return;
        }

        if (!verifyUser(user, verificationToken)) {
            console.log("can't verify user");
            res.status(401).send("User does not have valid credentials to update answers.");
            return;
        }

        // create answers object for user if it doesn't exist or is the wrong format
        if (!user.answers || typeof user.answers !== "object" || Array.isArray(user.answers)) {
            user.answers = {};
        }

        // update the user's answer to the given question
        user.answers[quizId.toString()] = answer;
        // so that Mongoose knows to update the answers object in the db
        user.markModified('answers');

        user.save(function (saveErr, updatedUser) {
            if (saveErr) {
                console.log("Error updating answer to a question: ", saveErr)
                res.status(500).send("Server error, try again later.");
                return;
            }
            res.send(removePassword(updatedUser));
        });
    })
});


app.post("/candidate/updateAllOnboarding", candidateApis.POST_updateAllOnboarding);


// --->> BUSINESS APIS <<--- //

//----->> POST EMPLOYER <<------
// creates a new user at the same company the current user works for
app.post('/employer', function (req, res) {
    let newUser = sanitize(req.body.newUser);
    let currentUser = sanitize(req.body.currentUser);

    // if no user given
    if (!newUser) {
        res.status(400).send("No user to create was sent.");
        return;
    }

    // if no current user
    if (!currentUser) {
        res.status(403).send("Must be logged in to create a business user.");
        return;
    }

    let query = {_id: currentUser._id};
    Employers.findOne(query, function (err, currentUserFromDB) {
        if (err) {
            console.log("error getting current user on business user creation: ", err);
            res.status(500).send("Error, try again later.");
            return;
        }

        // current user not found in db
        if (!currentUserFromDB || currentUserFromDB == null) {
            res.status(500).send("Your account was not found.");
            return;
        }

        // if current user does not have the right verification token
        if (!currentUser.verificationToken || currentUser.verificationToken !== currentUserFromDB.verificationToken) {
            res.status(403).send("Current user has incorrect credentials.");
            return;
        }

        // if current user does not have correct permissions
        if (currentUserFromDB.userType !== "employer") {
            res.status(403).send("User does not have the correct permissions to create a new business user.");
            return;
        }

        if (!currentUserFromDB.company || !currentUserFromDB.company.companyId) {
            res.status(403).send("User does not have an attached business.");
        }

        // hash the user's temporary password
        const saltRounds = 10;
        bcrypt.genSalt(saltRounds, function (err, salt) {
            bcrypt.hash(newUser.password, salt, function (err2, hash) {
                // change the stored password to be the hash
                newUser.password = hash;
                newUser.verified = false;
                newUser.company = currentUserFromDB.company;

                // create user's verification strings
                newUser.emailVerificationToken = crypto.randomBytes(64).toString('hex');
                newUser.verificationToken = crypto.randomBytes(64).toString('hex');
                const query = {email: newUser.email};

                // check if there's already a user with that email
                getUserByQuery(query, function(error, foundUser) {
                    if (error && error !== null) {
                        console.log(error);
                        res.status(500).send("Error creating new user, try again later or contact support.");
                        return;
                    }

                    // if found user is null, that means no user with that email already exists,
                    // which is what we want
                    if (foundUser == null || foundUser == undefined) {
                        // store the user in the db
                        Employers.create(newUser, function (err4, newUserFromDB) {
                            if (err4) {
                                console.log(err4);
                                res.status(500).send("Error, please try again later.");
                                return;
                            }

                            // add the user to the company
                            const companyQuery = {_id: currentUserFromDB.company.companyId};
                            Businesses.findOne(companyQuery, function(err5, company) {
                                if (err5) {
                                    console.log(err5);
                                    res.status(500).send("Error adding user to company record.");
                                    return;
                                }

                                company.employerIds.push(newUserFromDB._id);
                                // save the new company info with the new user's id
                                company.save(function(err6) {
                                    if (err6) {
                                        console.log(err56);
                                        res.status(500).send("Error adding user to company record.");
                                        return;
                                    }

                                    // success, send back the name of the company they work for
                                    res.json(company.name);
                                });
                            });
                        })
                    } else {
                        res.status(401).send("An account with that email address already exists.");
                    }
                });
            });
        });
    });
});


// SEND BUSINESS USER VERIFICATION EMAIL
app.post('/sendEmployerVerificationEmail', function (req, res) {
    let email = sanitize(req.body.email);
    let companyName = sanitize(req.body.companyName);
    let query = {email: email};

    Employers.findOne(query, function (err, user) {
        let recipient = user.email;
        let subject = 'Verify email';
        let content =
             '<div style="font-size:15px;text-align:center;font-family: Arial, sans-serif;color:#686868">'
            +   '<a href="https://www.moonshotlearning.org/" style="color:#00c3ff"><img style="height:100px;margin-bottom:20px"src="https://image.ibb.co/ndbrrm/Official_Logo_Blue.png"/></a><br/>'
            +   '<div style="text-align:justify;width:80%;margin-left:10%;">'
            +       '<span style="margin-bottom:20px;display:inline-block;">You have been signed up for Moonshot through ' + companyName + '! Please <a href="https://www.moonshotlearning.org/verifyEmail?userType=employer&token=' + user.emailVerificationToken + '">verify your account</a> to start finding your next great hire.</span><br/>'
            +       '<span style="display:inline-block;">If you have any questions or concerns, please feel free to email us at <a href="mailto:Support@MoonshotLearning.org">Support@MoonshotLearning.com</a>.</span><br/>'
            +   '</div>'
            +   '<a style="display:inline-block;height:28px;width:170px;font-size:18px;border:2px solid #00d2ff;color:#00d2ff;padding:10px 5px 0px;text-decoration:none;margin:20px;" href="https://www.moonshotlearning.org/verifyEmail?userType=employer&token='
            +   user.emailVerificationToken
            +   '">VERIFY ACCOUNT</a>'
            +   '<div style="text-align:left;width:80%;margin-left:10%;">'
            +       '<span style="margin-bottom:20px;display:inline-block;">On behalf of the Moonshot Team, we welcome you to our family and look forward to helping you pave your future and shoot for the stars.</span><br/>'
            +   '</div>'
            +'</div>';

        const sendFrom = "Moonshot";
        sendEmail(recipient, subject, content, sendFrom, undefined, function (success, msg) {
            if (success) {
                res.json(msg);
            } else {
                res.status(500).send(msg);
            }
        })
    });
});


// VERIFY CHANGE PASSWORD
app.post('/changeTempPassword', function (req, res) {
    const userInfo = sanitize(req.body);

    const email = userInfo.email;
    const oldPassword = userInfo.oldPassword;
    const password = userInfo.password;

    var query = {email};
    Employers.findOne(query, function (err, user) {
        if (err || user == undefined || user == null) {
            res.status(404).send("User not found.");
            return;
        }

        if (!user.verified) {
            res.status(403).send("Must verify email before changing password.")
            return;
        }

        bcrypt.compare(oldPassword, user.password, function (passwordError, passwordsMatch) {
            if (!passwordsMatch || passwordError) {
                console.log("if there was an error, it was: ", passwordError);
                console.log("passwords match: ", passwordsMatch)
                res.status(403).send("Old password is incorrect.");
                return;
            }

            query = {_id: user._id};
            const saltRounds = 10;
            bcrypt.genSalt(saltRounds, function (err2, salt) {
                bcrypt.hash(password, salt, function (err3, hash) {
                    if (err2 || err3) {
                        console.log("errors in hashing: ", err2, err3);
                        res.status(500).send("Error saving new password.");
                        return;
                    }

                    // change the stored password to be the hash
                    const newPassword = hash;
                    // if the field doesn't exist, $set will set a new field
                    var update = {
                        '$set': {
                            password: newPassword
                        },
                        '$unset': {
                            passwordToken: "",
                            time: '',
                        }
                    };

                    // When true returns the updated document
                    var options = {new: true};

                    Employers.findOneAndUpdate(query, update, options, function (err4, newUser) {
                        if (err4) {
                            console.log(err4);
                            res.status(500).send("Error saving new password.");
                            return;
                        }

                        res.json(removePassword(newUser));
                    });
                });
            });
        });
    });
});


// GET A COMPANY'S PATHWAY NAMES
app.get("/business/pathways", function(req, res) {
    const userId = sanitize(req.query.userId);
    const verificationToken = sanitize(req.query.verificationToken);

    if (!userId || !verificationToken) {
        res.status(400).send("Bad request.");
        return;
    }

    Employers.findById(userId, function(findBUserErr, user) {
        // error finding user in db
        if (findBUserErr) {
            console.log("Error finding business user who was trying to see their pathways: ", findBUserErr);
            res.status(500).send("Server error, try again later.");
            return;
        }

        // couldn't find user in business user db, either they have the wrong
        // type of account or are trying to pull some dubious shenanigans
        if (!user) {
            res.status(403).send("You do not have permission to access pathway info.");
            return;
        }

        // user does not have the right verification token, probably trying to
        // pull a fast one on us
        if (user.verificationToken !== verificationToken) {
            res.status(403).send("You do not have permission to access pathway info.");
            return;
        }

        const companyId = user.company.companyId;
        Businesses.findById(companyId, function(findBizErr, company) {
            if (findBizErr) {
                console.log("Error finding business when trying to search for pathways: ", findBizErr);
                res.status(500).send("Server error, try again later.");
                return;
            }

            if (!company) {
                console.log("Business not found when trying to search for pathways.");
                res.status(500).send("Server error, try again later.");
                return;
            }

            // if the business doesn't have an associated user with the given
            // user id, don't let them see this business' candidates
            const userIdString = userId.toString();
            if (!company.employerIds.some(function(bizUserId) {
                return bizUserId.toString() === userIdString;
            })) {
                console.log("User tried to log in to a business with an id that wasn't in the business' id array.");
                res.status(403).send("You do not have access to this business' pathways.");
                return;
            }

            // if we got to this point it means the user is allowed to see pathways

            let pathwayQuery = { '_id': { $in: company.pathwayIds } }

            // find names of all the pathways associated with the business
            Pathways.find(pathwayQuery)
                .select("name")
                .exec(function(findPathwaysErr, pathways) {
                    if (findPathwaysErr) {
                        res.status(500).send("Server error, couldn't get pathways to search by.");
                    } else {
                        const pathwaysToReturn = pathways.map(function(path) {
                            return {name: path.name, _id: path._id};
                        })
                        res.json(pathwaysToReturn);
                    }
                });
        });
    })
});


// SEARCH FOR CANDIDATES
app.get("/business/candidateSearch", function(req, res) {
    const userId = sanitize(req.query.userId);
    const verificationToken = sanitize(req.query.verificationToken);

    if (!userId || !verificationToken) {
        res.status(400).send("Bad request.");
        return;
    }

    Employers.findById(userId, function(findBUserErr, user) {
        // error finding user in db
        if (findBUserErr) {
            console.log("Error finding business user who was trying to see their candidates: ", findBUserErr);
            res.status(500).send("Server error, try again later.");
            return;
        }

        // couldn't find user in business user db, either they have the wrong
        // type of account or are trying to pull some dubious shenanigans
        if (!user) {
            res.status(403).send("You do not have permission to access candidate info.");
            return;
        }

        // user does not have the right verification token, probably trying to
        // pull a fast one on us
        if (user.verificationToken !== verificationToken) {
            res.status(403).send("You do not have permission to access candidate info.");
            return;
        }

        const companyId = user.company.companyId;
        Businesses.findById(companyId, function(findBizErr, company) {
            if (findBizErr) {
                console.log("Error finding business when trying to search for candidates: ", findBizErr);
                res.status(500).send("Server error, try again later.");
                return;
            }

            if (!company) {
                console.log("Business not found when trying to search for candidates.");
                res.status(500).send("Server error, try again later.");
                return;
            }

            // if the business doesn't have an associated user with the given
            // user id, don't let them see this business' candidates
            const userIdString = userId.toString();
            if (!company.employerIds.some(function(bizUserId) {
                return bizUserId.toString() === userIdString;
            })) {
                console.log("User tried to log in to a business with an id that wasn't in the business' id array.");
                res.status(403).send("You do not have access to this business' candidates.");
                return;
            }

            // if we got to this point it means the user is allowed to see candidates

            // all of a company's candidates
            const allCandidates = company.candidates;

            const searchTerm = sanitize(req.query.searchTerm);
            const hiringStage = sanitize(req.query.hiringStage);
            const pathway = sanitize(req.query.pathway);

            let candidatesToReturn = [];

            // go through each candidate, only add them if they match all
            // the search factors
            allCandidates.forEach(function(candidate) {
                if (searchTerm) {
                    // case insensitive search term regex
                    const termRegex = new RegExp(searchTerm, "i");
                    // if neither name nor email match search term, don't add
                    if (!(termRegex.test(candidate.email) || termRegex.test(candidate.name))) {
                        return;
                    }
                }
                if (hiringStage || pathway) {
                    // go through each of the candidates pathways, if they aren't
                    // at this hiring stage for any, return
                    const hasStageAndPathway = candidate.pathways.some(function(path) {
                        // if only looking for a certain pathway, just look for matching pathway
                        if (!hiringStage) {
                            return path.name == pathway;
                        }
                        // if only looking for certain hiring stage, just look for matching hiring stage
                        else if (!pathway) {
                            return path.hiringStage == hiringStage;
                        }
                        // otherwise look for a matching pathway name AND hiring stage on the same pathway
                        else {
                            return path.hiringStage == hiringStage && path.name == pathway;
                        }
                    });
                    if (!hasStageAndPathway) {
                        return;
                    }
                }

                // if the candidate made it past all the search terms, add them
                candidatesToReturn.push(candidate);
            });

            res.json(candidatesToReturn);
        });
    })
});


app.post("/resumeScorer/uploadResume", function(req, res) {
    try {
        const email = sanitize(req.body.email);
        const name = sanitize(req.body.name);
        const desiredCareers = sanitize(req.body.desiredCareers);
        const skills = sanitize(req.body.skills);
        const resumeFile = req.files.resumeFile;
        const resumeFileName = resumeFile.name;

        // only allow certain file types to be uploaded
        let extension = resumeFileName.split('.').pop().toLowerCase();
        const allowedFileTypes = ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'];
        if (!allowedFileTypes.some(function(fileType) {
           return fileType === extension;
        })) {
           console.log(`User tried to upload a file of type .${extension}, which is not allowed.`);
           return res.status(400).send("Wrong file type.");
        }

        let recipients = ["kyle@moonshotlearning.org", "justin@moonshotlearning.org", "ameyer24@wisc.edu"];

        let subject = 'Resume To Be Scored';
        let content =
            '<div>'
            +   '<p>New resume to be scored.</p>'
            +   '<p>Name: ' + name + '</p>'
            +   '<p>email: ' + email + '</p>'
            +   '<p>Skills: ' + skills + '</p>'
            +   '<p>Desired Careers: ' + desiredCareers + '</p>'
            + '</div>';
        let attachments = [{
            filename: resumeFileName,
            content: new Buffer(resumeFile.data,'7bit')
        }];

        const sendFrom = "Moonshot";
        sendEmail(recipients, subject, content, sendFrom, attachments, function (success, msg) {
            // on failure
            if (!success) {
                console.log("Error sending sign up alert email: ", msg);
                res.status(500).send("Error uploading resume, try again later.");
                return;
            }
            // on success
            return res.json("Success!");
        })
    }
    catch (error) {
        console.log("Error sending resume to Kyle: ", error);
        return res.status(500).send("Error uploading, try again later.");
    }
});


// post a new business to the db
app.post("/business", async function(req, res) {
    const body = req.body;
    const userId = sanitize(body.userId);
    const verificationToken = sanitize(body.verificationToken);
    const businessName = sanitize(body.businessName);
    const initialUserName = sanitize(body.initialUserName);
    const initialUserPassword = sanitize(body.initialUserPassword);
    const initialUserEmail = sanitize(body.initialUserEmail);

    // validate admin is admin user
    const isAdmin = await verifyAdmin(userId, verificationToken);
    if (!isAdmin) {
        res.status(403).send("You do not have permission to add businesses.");
        return;
    }

    try {
        // check if another business with that name already exists
        const businessNameQuery = {name: businessName};
        const foundBiz = await Businesses.findOne(businessNameQuery);

        // business already exists with that name
        if (foundBiz) {
            res.status(400).send("A business already exists with that name. Try a different name.");
            return;
        }

        // no business exists with that name, can go ahead and make new business
        const newBusiness = {
            name: businessName
        };

        // make the business in the db
        let createdBusiness = await Businesses.create(newBusiness);

        // check if a user (business- or non-business-) with the email provided
        // already exists
        const userEmailQuery = {email: initialUserEmail};
        getUserByQuery(userEmailQuery, function(findUserErr, foundUser) {
            // error looking for user by email
            if (findUserErr) {
                console.log("Error looking for a user by email: ", findUserErr);
                res.json("Successful business creation, but couldn't create initial user.");
                return;
            }
            // user found with that email so can't create it
            else if (foundUser) {
                res.json("Successful business creation, but user with that email already exists.");
                return;
            }

            // can create the initial user

            // function that will create employer and save them to the business
            // once the business has been created
            // executes right after creation once hash as been made
            const createEmployerWithPassword = async (createHashErr, hash) => {
                const newEmployer = {
                    name: initialUserName,
                    email: initialUserEmail,
                    password: hash,
                    userType: "employer",
                    verificationToken: crypto.randomBytes(64).toString('hex'),
                    verified: true,
                    company: {
                        name: createdBusiness.name,
                        companyId: createdBusiness._id
                    }
                };
                // create the employer
                try {
                    let createdEmployer = await Employers.create(newEmployer);

                    // ensure the business has a list of business user ids
                    if (!Array.isArray(createdBusiness.businessUserIds)) {
                        createdBusiness.employerIds = [];
                    }
                    // add the employer to the business' list of recruiters
                    createdBusiness.employerIds.push(createdEmployer._id);

                    try {
                        // save the business with the new user in it
                        await createdBusiness.save();
                        // everything succeeded
                        res.json("Success!");
                        return;
                    }
                    // error saving employer to business' array of business user ids
                    catch (saveBizUserIdsErr) {
                        console.log("error saving employer to business' array of business user ids: ", saveBizUserIdsErr);
                        res.json("Successful business creation but error associating new business user with business.");
                        return;
                    }
                }
                // error creating the new user
                catch (createEmployerErr) {
                    console.log("Error creating new employer: ", createEmployerErr);
                    res.json("Successful business creation, but could not create initial user.");
                    return;
                }
            }

            // hash password and create the employer
            const SALT_ROUNDS = 10;
            bcrypt.hash(initialUserPassword, SALT_ROUNDS, createEmployerWithPassword);
        });
    }
    // error at some point in business creation
    catch (dbError) {
        console.log("Database error during creation: ", dbError);
        res.status(500).send("Server error, try again later.");
        return;
    }
});

// UPDATE HIRING STAGE OF A CANDIDATE (NOT CONTACTED, CONTACTED, INTERVIEWING, HIRED)
app.post("/business/updateHiringStage", async function(req, res) {
    const body = req.body;
    const userId = sanitize(body.userId);
    const verificationToken = sanitize(body.verificationToken);
    const companyId = sanitize(body.companyId);
    const candidateId = sanitize(body.candidateId);
    const hiringStage = sanitize(body.hiringStage);
    const isDismissed = sanitize(body.isDismissed);
    const pathwayId = sanitize(body.pathwayId);

    // if one of the arguments doesn't exist, return with error code
    if (!userId || !verificationToken || !companyId || !candidateId || !hiringStage || typeof isDismissed !== "boolean" || !pathwayId) {
        console.log("Not all arguments provided to /business/updateHiringStage");
        console.log("userId: ", userId);
        console.log("verificationToken: ", verificationToken);
        console.log("companyId: ", companyId);
        console.log("candidateId: ", candidateId);
        console.log("hiringStage: ", hiringStage);
        console.log("isDismissed: ", isDismissed);
        console.log("pathwayId: ", pathwayId);
        res.status(400).send("Bad request.");
        return;
    }

    // ensure the hiring stage provided is valid
    const validHiringStages = ["Not Contacted", "Contacted", "Interviewing", "Hired"];
    if (!validHiringStages.includes(hiringStage)) {
        console.log("Invalid hiring stage provided.");
        return res.status(400).send("Invalid hiring stage provided.");
    }

    // verify the employer is actually a part of this organization
    verifyEmployerAndReturnBusiness(userId, verificationToken, companyId)
    .then(business => {
        // if employer does not have valid credentials
        if (!business) {
            console.log("Employer tried to change candidate's hiring status but could not be verified.");
            res.status(403).send("You do not have permission to change a candidate's hiring stage.");
            return;
        }

        // the index of the candidate in the business' candidate array
        const candidateIndex = business.candidates.findIndex(currCandidate => {
            return currCandidate.userId.toString() === candidateId.toString();
        });

        let candidate = business.candidates[candidateIndex];
        // get the index of the pathway in the user's pathways array
        const pathwayIndex = candidate.pathways.findIndex(currPathway => {
            return currPathway._id.toString() === pathwayId;
        })

        // change the candidate's hiring stage and dismissal status to match
        // the arguments that were passed in
        candidate.pathways[pathwayIndex].isDismissed = isDismissed;
        candidate.pathways[pathwayIndex].hiringStage = hiringStage;
        candidate.pathways[pathwayIndex].hiringStageEdited = new Date();

        // update the candidate in the business object
        business.candidates[candidateIndex] = candidate;

        // save the business
        business.save()
        .then(updatedBusiness => {
            return res.json("success");
        })
        .catch(updateBusinessErr => {
            return res.status(500).send("failure!");
        });
    })
    .catch(verifyEmployerErr => {
        console.log("Error when trying to verify employer when they were trying to edit a candidate's hiring stage: ", verifyEmployerErr);
        res.status(500).send("Server error, try again later.");
        return;
    })

    // TODO make sure the timestamp of the last change is before the timestamp given
    // if it isn't, don't change the user

});


// --->> END BUSINESS APIS <<--- //

// END APIs


// --->>> EXAMPLE INFO CREATION <<<---

// const exampleInfo = {
//     contentArray: []
// }
// Info.create(exampleInfo, function(err, link) {
//     console.log(err);
//     console.log(link);
// })

// --->>> END EXAMPLE INFO CREATION <<<---


// print all users from a specific pathway
// nwm: "5a80b3cf734d1d0d42e9fcad"
// sw: "5a88b4b8734d1d041bb6b386"

// printUsersFromPathway("5a88b4b8734d1d041bb6b386");


// update all users with a specific thing, used if something is changed about
// the user model
// Pathways.find({}, function(err, pathways) {
//     console.log("err is: ", err);
//
//     for (let pathwayIdx = 0; pathwayIdx < pathways.length; pathwayIdx++) {
//         let pathway = pathways[pathwayIdx];
//         //pathway.userType = "candidate";
//
//         let steps = pathway.steps;
//
//         for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
//             let step = steps[stepIndex];
//             let subSteps = step.subSteps;
//
//             for (let subStepIndex = 0; subStepIndex < subSteps.length; subStepIndex++) {
//                 let subStep = subSteps[subStepIndex];
//
//                 if (subStep.contentType === "quiz") {
//                     pathway.steps[stepIndex].subSteps[subStepIndex].required = true;
//                 }
//             }
//         }
//
//         pathway.save(function() {
//             console.log("pathway saved");
//         });
//     }
// })



app.listen(3001, function (err) {
    if (err) {
        return console.log(err);
    }
})
