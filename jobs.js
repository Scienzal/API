const { log } = console;

const express = require('express');
const app = express.Router();

const db = require('./db');

app.get('/get', async (req, res) => {
    const { cpu, ram } = req.query;
    if (!cpu || !ram) return res.status(400).json({ error: `CPU or RAM missing!` });

    let isJobAvailable = true;
    let ramAvailable = parseInt(ram);
    let cpuAvailable = parseFloat(cpu);
    let jobs = [];
    let actions = [];

    const client = req.serverClient;

    while (isJobAvailable == true) {
        const job = await db.Job.findOne({
            status: 'waiting',
            type: 'docker',

            ramRequired: { $lt: ramAvailable },
            cpuRequired: { $lt: cpuAvailable },

            reputation: { $lte: client.reputation },
            cpu: client.cpu
        });
        if (!job) {
            isJobAvailable = false;
        } else {
            // Job is available

            job.status = 'process';
            job.start = Date.now();
            job.clientID = client._id;
            await job.save();

            var log = new db.Log({
                jobID: job._id,
                message: `[SYSTEM] Job assigned to client ${client._id}`
            });
            await log.save();

            jobs.push({
                ID: job._id,
                functionID: job.functionID,

                ramRequired: job.ramRequired,
                cpuRequired: job.cpuRequired,
                timeLimit: job.timeLimit,

                baseImage: job.baseImage,
                baseCommand: job.baseCommand,
                command: job.command,

                data: job.data
            });

            ramAvailable = ramAvailable - job.ramRequired;
            cpuAvailable = cpuAvailable - job.cpuRequired;

            // End job
        }
        // End while
    }


    if (jobs.length == 0) return res.json({
        found: false
    });

    req.serverClient.status = 'process';
    req.serverClient.lastPing = Date.now();
    await req.serverClient.save();

    res.json({
        found: true,

        jobs
    });
});

app.post('/log', async (req, res) => {
    const { id } = req.query;
    if (!id || String(id).length < 12) return res.status(400).json({ error: `ID missing!` });

    const job = await db.Job.findOne({ clientID: req.serverClient._id, _id: id });

    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message!' });

    if (!job) return res.status(404).json({
        error: 'Client does not have a job!'
    });

    var log = new db.Log({
        jobID: job._id,
        message
    });
    await log.save();

    res.json({
        ok: true,
        ID: log._id
    });
});

app.post('/finish', async (req, res) => {
    const { id } = req.query;
    if (!id || String(id).length < 12) return res.status(400).json({ error: `ID missing!` });

    const job = await db.Job.findOne({ clientID: req.serverClient._id, _id: id });

    const { ok, exitCode, error } = req.body;
    if (ok == null || ok == undefined || exitCode == null || exitCode == undefined) return res.status(400).json({ error: 'Missing ok or exitCode in body' });

    if (ok == false && !error) return res.status(400).json({ error: 'Missing error for failed job' });

    if (!job) return res.status(404).json({
        error: 'Client does not have a job!'
    });

    var log = new db.Log({
        jobID: job._id,
        message: `Job ${job._id} finished with code: ${exitCode}`
    });
    await log.save();

    if (ok == false) {
        var ErrorLog = new db.Log({
            jobID: job._id,
            message: `Error: ${error}`
        });
        await ErrorLog.save();
    }

    job.status = 'completed';
    job.exitCode = exitCode;
    job.end = Date.now();
    job.time = Math.round((job.end - job.start) / 1000); // in seconds

    var GBs = (job.ramRequired / 1024) * job.time;
    var CPUs = job.cpuRequired * job.time;

    var GBCost = GBs * 1 * 3;
    var CPUCost = CPUs * 5 * 3;

    if (job.cpu == 'arm') {
        // ARM is 30% cheaper
        GBCost = GBCost * 0.7;
        CPUCost = CPUCost * 0.7;
    }

    job.cost = (GBCost + CPUCost);
    await job.save();

    console.log(`[${job._id}] Cost: ${(GBCost + CPUCost)}c - Time ${job.time}s`);

    var JobUser = await db.User.findById(job.userID);
    if (!JobUser) {
        return res.status(404).json({ error: 'JobUser not found?!' });
    }
    if (JobUser.isFree == false) {
        req.serverClient.credits = req.serverClient.credits + ((GBCost + CPUCost) * 0.8);
        console.log(`Added ${((GBCost + CPUCost) * 0.8)}c to user`);
        await req.serverClient.save();

        var AdminUser = await db.User.findOne({ email: 'info@bastothemax.nl' });
        if (AdminUser) {
            AdminUser.credits = AdminUser.credits + ((GBCost + CPUCost) * 0.2);
            await AdminUser.save();
            console.log(`Added ${((GBCost + CPUCost) * 0.2)}c to admin`);
        } else {
            console.log(`AdminUser not found!`);
        }
    }

    JobUser.credits = JobUser.credits - ((GBCost + CPUCost) * 1);
    await JobUser.save();

    res.json({
        ok: true,
        ID: log._id
    });
});

module.exports = app;