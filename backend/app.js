/**
 * Advanced Mailwarm System (Upgraded)
 * Features:
 * - Dynamic seed inbox network
 * - Human-like email generation
 * - Reply simulation
 * - Smart delays
 * - Improved gating logic
 */

const AWS = require('aws-sdk');
const mongoose = require('mongoose');
const cron = require('node-cron');
const express = require('express');

const ses = new AWS.SES({ region: 'us-east-1' });

// ================= DB =================

mongoose.connect(process.env.MONGO_URI);

const SeedInbox = mongoose.model('SeedInbox', new mongoose.Schema({
  email: String,
  provider: String,
  active: Boolean,
  health_score: { type: Number, default: 100 }
}));

const Warmup = mongoose.model('Warmup', new mongoose.Schema({
  domain: String,
  daily_limit: Number,
  sent_today: Number,
  status: String,
  metrics: {
    bounce_rate: Number,
    complaint_rate: Number,
    reply_rate: Number,
    open_rate: Number
  }
}));

// ================= ENGINE =================

class WarmupEngine {

  async sendWarmup(domain) {
    const warmup = await Warmup.findOne({ domain });
    if (!warmup || warmup.status === 'paused') return;

    const seedEmails = await SeedInbox.find({ active: true });

    if (!seedEmails.length) {
      console.log("No seed inboxes");
      return;
    }

    for (let i = 0; i < 5; i++) {
      const target = this.random(seedEmails);

      const email = this.generateEmail();

      await ses.sendEmail({
        Source: `noreply@${domain}`,
        Destination: { ToAddresses: [target.email] },
        Message: {
          Subject: { Data: email.subject },
          Body: { Text: { Data: email.body } }
        }
      }).promise();

      await this.delay();
    }

    warmup.sent_today += 5;
    await warmup.save();
  }

  generateEmail() {
    const subjects = [
      "Quick question",
      "Checking in",
      "Follow up",
      "Just a thought"
    ];

    const bodies = [
      "Hey, just checking if you saw this.",
      "Let me know your thoughts.",
      "Following up on this.",
      "Quick ping!"
    ];

    return {
      subject: this.random(subjects),
      body: this.random(bodies)
    };
  }

  async simulateReply() {
    const seeds = await SeedInbox.find({ active: true });

    for (const inbox of seeds) {
      if (Math.random() > 0.5) continue;

      const reply = {
        subject: "Re: Quick question",
        body: "Thanks, got it. Will check."
      };

      await ses.sendEmail({
        Source: inbox.email,
        Destination: { ToAddresses: ["noreply@yourdomain.com"] },
        Message: {
          Subject: { Data: reply.subject },
          Body: { Text: { Data: reply.body } }
        }
      }).promise();
    }
  }

  async checkMetrics(domain) {
    // Fake for now (replace with CloudWatch)
    const metrics = {
      bounce_rate: Math.random() * 2,
      complaint_rate: Math.random() * 0.1,
      reply_rate: Math.random() * 10,
      open_rate: Math.random() * 50
    };

    const warmup = await Warmup.findOne({ domain });

    warmup.metrics = metrics;

    if (
      metrics.bounce_rate > 2 ||
      metrics.complaint_rate > 0.1
    ) {
      warmup.status = "paused";
      console.log(`Paused ${domain}`);
    }

    await warmup.save();
  }

  random(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async delay() {
    const ms = Math.floor(Math.random() * 5000) + 1000;
    return new Promise(r => setTimeout(r, ms));
  }
}

const engine = new WarmupEngine();

// ================= CRON =================

// send emails every hour
cron.schedule('0 * * * *', async () => {
  const domains = await Warmup.find({ status: "active" });
  for (const d of domains) {
    await engine.sendWarmup(d.domain);
  }
});

// simulate replies
cron.schedule('*/30 * * * *', async () => {
  await engine.simulateReply();
});

// check metrics
cron.schedule('0 */6 * * *', async () => {
  const domains = await Warmup.find();
  for (const d of domains) {
    await engine.checkMetrics(d.domain);
  }
});

// ================= API =================

const app = express();
app.use(express.json());

app.post('/start', async (req, res) => {
  const { domain } = req.body;

  const warmup = new Warmup({
    domain,
    daily_limit: 50,
    sent_today: 0,
    status: "active"
  });

  await warmup.save();

  res.json({ success: true });
});

app.get('/status/:domain', async (req, res) => {
  const data = await Warmup.findOne({ domain: req.params.domain });
  res.json(data);
});

app.listen(3000, () => console.log("Server running"));