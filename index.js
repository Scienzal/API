require('dotenv').config();
const { env } = process;
const { log } = console;

const express = require('express');
const app = express();

const db = require('./db');

app.use(express.json());



app.use(async (req, res, next) => {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const client = await db.Client.findOne({
        code
    });
    if (!client) return res.status(400).json({ error: 'Invalid code' });

    req.serverClient = client;

    next();
});

app.get('/connect', async (req, res) => {
    const { cpu, cpucount, ram } = req.query;

    if (cpucount < req.serverClient.maxCPU) return res.status(400).json({ error: 'CPU is overallocated' });
    if (ram < req.serverClient.maxRAM) return res.status(400).json({ error: 'RAM is overallocated' });

    if (req.serverClient.cpu != cpu) return res.status(400).json({ error: `Invalid cpu. Client CPU: ${cpu}. Registered CPU: ${req.serverClient.cpu}` });

    req.serverClient.lastPing = Date.now();
    req.serverClient.status = 'process';
    await req.serverClient.save();

    var clientJobs = await db.Job.find({
        clientID: req.serverClient._id,
        status: 'process'
    });

    for(let j = 0; j < clientJobs.length; j++) {

        var job = clientJobs[j];

        job.status = 'waiting';
        job.start = 0;
        await job.save();

        var log = new db.Log({
            jobID: job._id,
            message: `[SYSTEM] Client ${req.serverClient._id} restarted. Rescheduling...`
        });
        await log.save();

    }

    res.json({
        message: 'Connected!',
        cpu: req.serverClient.maxCPU,
        ram: req.serverClient.maxRAM
    });
});

app.get('/close', async (req, res) => {
    req.serverClient.lastPing = Date.now();
    req.serverClient.status = 'offline';
    await req.serverClient.save();

    res.json({ message: 'Connection closed!' });
});

/*
    Ping endpoint. Updates the lastping value in the database to mark it online.
    If the client was offline, then mark it as back online.
*/
app.get('/ping', async (req, res) => {
    req.serverClient.lastPing = Date.now();
    if (req.serverClient.status == 'offline') req.serverClient.status = 'waiting';

    await req.serverClient.save();

    res.json({ message: 'Ping is OK' });
});

/*
    JOB ENDPOINTS!
*/
app.use('/jobs', require('./jobs'));


app.listen(env.PORT, env.HOST, () => {
    log(`Online at port ${env.HOST}:${env.PORT}`);

    checkClients();
});

async function checkClients() {
    /* AFK Clients */
    const waiting = await offlineClientStatus('waiting', 10);

    for(let i = 0; i < waiting.length; i++) {
        var client = waiting[i];

        client.status = 'offline';
        await client.save();

        console.log(`Client ${client._id} is now offline! (WAITING)`);
    }

    /* Working clients */
    const process = await offlineClientStatus('process', 3);

    for(let i = 0; i < process.length; i++) {
        var client = process[i];

        var clientJobs = await db.Job.find({
            clientID: client._id,
            status: 'process'
        });

        for(let j = 0; j < clientJobs.length; j++) {

            var job = clientJobs[j];

            job.status = 'waiting';
            job.start = 0;
            await job.save();

            var log = new db.Log({
                jobID: job._id,
                message: `[SYSTEM] Client ${client._id} missed heartbeat. Rescheduling...`
            });
            await log.save();

        }

        client.status = 'offline';
        await client.save();


        console.log(`Client ${client._id} is now offline! (PROCESS)`);
    }

}

async function offlineClientStatus(status, minute) {
    const offlineClients = await db.Client.find({
        status,
        lastPing: { $lt: Date.now()-(1000*60*minute) }
    });

    return offlineClients;
}

setInterval(checkClients, 1000*60*1)