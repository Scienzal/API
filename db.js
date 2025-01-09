/* !!! PULL FROM https://github.com/Meegie/Dashboard/blob/main/db.js !!! */

const mongoose = require('mongoose');
mongoose.connect(process.env.DB);

const User = mongoose.model('User', {
    email: String,
    password: String,

    mailVerified: Boolean,
    verifyToken: String,
    mailSent: Boolean,

    firstName: String,
    lastName: String,
    country: String,
    phoneNumber: String,
    address: String,

    isAdmin: Boolean,
    isFree: Boolean,

    credits: Number
});


/* Serverless */
const Job = mongoose.model('Job', {
    userID: String,
    functionID: String,

    name: String,
    type: String, // browser | docker
    status: String,

    image: String,

    ramRequired: Number,
    cpuRequired: Number,
    timeLimit: Number,

    baseImage: String,
    baseCommand: String,
    command: String,
    data: String,
    
    clientID: String,

    start: Number,
    end: Number,
    time: Number,

    cost: Number,
    initalCost: Number,

    exitCode: Number,
     
    reputation: Number,
    cpu: String
});
const Log = mongoose.model('Log', {
    jobID: String,

    message: String
});

const Client = mongoose.model('Client', {
    userID: String,

    name: String,
    type: String, // browser | docker
    cpu: String, // x86 | arm
    status: String,
    code: String,

    lastPing: Number,
    reputation: Number, // none = 0, verified = 1, datacenter = 2

    maxRAM: Number,
    maxCPU: Number,
    maxTime: Number,

    cpu: String // x86 or arm
});

module.exports = {
    User,

    Job,
    Client,
    
    Log
};