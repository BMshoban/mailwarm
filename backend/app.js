require('dotenv').config();

const AWS = require('aws-sdk');
const mongoose = require('mongoose');
const cron = require('node-cron');
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ================= AWS =================

const ses = new AWS.SES({
  region: process.env.AWS_REGION
});

const sesv2 = new AWS.SESV2({
  region: process.env.AWS_REGION
});

const cloudwatch = new AWS.CloudWatch({
  region: process.env.AWS_REGION
});

// ================= DB =================

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
  })
  .catch(err => {
    console.error(err);
  });

// ================= MODELS =================

const Client = mongoose.model('Client', new mongoose.Schema({
  name: String,
  email: String,
  api_key: String
}));

const Domain = mongoose.model('Domain', new mongoose.Schema({
  client_id: String,
  domain: String,
  config_set: String,
  daily_limit: Number,
  sent_today: Number,
  status: String,
  metrics: Object,
  start_date: { type: Date, default: Date.now }
}));

const SeedInbox = mongoose.model('SeedInbox', new mongoose.Schema({
  email: String,
  active: Boolean
}));

// ================= HELPERS =================

function generateApiKey() {
  return crypto.randomBytes(16).toString('hex');
}

// ================= METRICS =================

async function getSESMetrics(configSet) {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const names = ["Send", "Delivery", "Bounce", "Complaint"];
  const results = {};

  for (const name of names) {
    const data = await cloudwatch.getMetricStatistics({
      Namespace: "AWS/SES",
      MetricName: name,
      Dimensions: [{ Name: "ses:configuration-set", Value: configSet }],
      StartTime: start,
      EndTime: end,
      Period: 86400,
      Statistics: ["Sum"]
    }).promise();

    results[name] = data.Datapoints[0]?.Sum || 0;
  }

  const sent = results.Send || 1;

  return {
    bounce_rate: (results.Bounce / sent) * 100,
    complaint_rate: (results.Complaint / sent) * 100,
    delivery_rate: (results.Delivery / sent) * 100
  };
}

// ================= ENGINE =================

class WarmupEngine {
  async sendWarmup(domainObj) {
    console.log(`\n--- 🚀 PROCESSING: ${domainObj.domain} ---`);

    // 1. Initial Safety Checks
    if (domainObj.status === "paused") {
      console.log(`[${domainObj.domain}] Status is paused. Skipping.`);
      return;
    }

    const remaining = domainObj.daily_limit - domainObj.sent_today;
    if (remaining <= 0) {
      console.log(`✅ [${domainObj.domain}] Daily limit reached. Checking metrics...`);
      await this.checkMetrics(domainObj);
      return;
    }

    // 2. Load and Validate Recipients
    if (!process.env.TEST_RECIPIENTS) {
      console.error("❌ CRITICAL: TEST_RECIPIENTS missing from ENV!");
      return;
    }

    const rawEmails = process.env.TEST_RECIPIENTS.split(',').map(e => e.trim());
    console.log(`[DEBUG] Target Inboxes: ${rawEmails.join(', ')}`);

    // 3. Calculate Batch Size
    const batch = Math.min(10, remaining);
    console.log(`[DEBUG] Preparing to send batch of: ${batch}`);

    // 4. The Sending Loop
    for (let i = 0; i < batch; i++) {
      const targetIndex = domainObj.sent_today % rawEmails.length;
      const fromEmail =
  process.env.SES_FROM_EMAIL ||
  `noreply@${domainObj.domain}`;ails[targetIndex];
      

      const params = {
        Source: `"Warmup" <${fromEmail}>`,
        Destination: { ToAddresses: [targetEmail] },
        Message: {
          Subject: { Data: this.randomSubject() },
          Body: {
            Html: {
  Data: `
    <html>
      <body style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
        <p>${this.randomBody()}</p>

        <br>

        <p>
          Best regards,
          <br>
          Shoban
          <br>
          DevOps
        </p>

      </body>
    </html>
  `
}
          }
        },
        ConfigurationSetName: domainObj.config_set || undefined
      };

      try {
        console.log(`📨 Sending email ${i + 1}/${batch} to ${targetEmail}...`);
        const result = await ses.sendEmail(params).promise();
        console.log(`✅ Success! ID: ${result.MessageId}`);

        domainObj.sent_today += 1;
        await Domain.updateOne(
  { _id: domainObj._id },
  {
    $inc: {
      sent_today: 1
    }
  }
);
        await this.delay(2000);

      } catch (error) {
        console.error(`❌ SES Failed for ${targetEmail}: ${error.message}`);
        if (
  error.code === 'AccountSendingPaused' ||
  error.code === 'LimitExceededException'
) break;
        continue;
      }
    }

    // 5. Final Wrap up
    await domainObj.save();
    console.log(`--- 🏁 FINISHED BATCH FOR: ${domainObj.domain} ---\n`);
    await this.checkMetrics(domainObj);
  }

  async checkMetrics(domainObj) {
    const metrics = await getSESMetrics(domainObj.config_set);

    // ================= HEALTH SCORE =================
    let health = 100;
    health -= (metrics.bounce_rate || 0) * 20;
    health -= (metrics.complaint_rate || 0) * 40;
    health += (metrics.delivery_rate || 0) * 0.1;

    if (health > 100) health = 100;
    if (health < 0) health = 0;

    // ================= SAVE METRICS =================
    domainObj.metrics = {
      bounce_rate: metrics.bounce_rate || 0,
      complaint_rate: metrics.complaint_rate || 0,
      delivery_rate: metrics.delivery_rate || 0,
      health_score: Math.round(health)
    };

    // ================= AUTO PAUSE =================
    if ((metrics.bounce_rate || 0) > 2 || (metrics.complaint_rate || 0) > 0.1) {
      domainObj.status = "paused";
      console.log(
  `🚨 Paused ${domainObj.domain} due to high bounce/complaint rate.`
);
      await domainObj.save();
      return;
    }

    // ================= AUTO SCALE =================
    if ((metrics.delivery_rate || 0) > 95 && (metrics.bounce_rate || 0) < 1) {
      domainObj.daily_limit += 20;
      if (domainObj.daily_limit > 2000) {
        domainObj.daily_limit = 2000;
      }
      console.log(`🚀 Scaling ${domainObj.domain} → ${domainObj.daily_limit}`);
    }

    await domainObj.save();
  }

  randomSubject() {
    const subjects = ["Quick question", "Checking in", "Follow up"];
    return subjects[Math.floor(Math.random() * subjects.length)];
  }

  randomBody() {
    const bodies = [
      "Hey, just checking if you saw this.",
      "Following up on this.",
      "Let me know your thoughts."
    ];
    return bodies[Math.floor(Math.random() * bodies.length)];
  }

  async delay(ms = 1000) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}


const engine = new WarmupEngine();

// ================= CRON =================

// send every minute
cron.schedule('*/1 * * * *', async () => {
  const domains = await Domain.find({ status: "active" });
  for (const d of domains) {
    console.log(`🚀 Triggering warmup check for ${d.domain}`);
    await engine.sendWarmup(d);
  }
});

// metrics check every 6 hours
cron.schedule('0 */6 * * *', async () => {
  const domains = await Domain.find();
  for (const d of domains) {
    await engine.checkMetrics(d);
  }
});

// reset counters daily
cron.schedule('0 0 * * *', async () => {
  const domains = await Domain.find();
  const today = new Date();

  const limitW1 = parseInt(process.env.WARMUP_WEEK_1_LIMIT) || 20;
  const limitW2 = parseInt(process.env.WARMUP_WEEK_2_LIMIT) || 30;
  const limitW3 = parseInt(process.env.WARMUP_WEEK_3_LIMIT) || 40;
  const limitW4 = parseInt(process.env.WARMUP_WEEK_4_LIMIT) || 50;
  const maxLimit = parseInt(process.env.WARMUP_MAX_LIMIT) || 200;

  for (const d of domains) {
    d.sent_today = 0;

    const diffTime = Math.abs(today - d.start_date);
    const daysActive = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (daysActive < 7) {
      d.daily_limit = limitW1;
    } else if (daysActive >= 7 && daysActive < 14) {
      d.daily_limit = limitW2;
    } else if (daysActive >= 14 && daysActive < 21) {
      d.daily_limit = limitW3;
    } else if (daysActive >= 21 && daysActive <= 30) {
      d.daily_limit = limitW4;
    }
    // Phase 2: Month 2 and Beyond (Dynamic Auto-Scaling)
    else {
      // It adds 5 emails to the limit for every day past day 30
      const daysPastMonthOne = daysActive - 30;
      const autoScaledLimit = limitW4 + (daysPastMonthOne * 5);

      // Ensures the limit never exceeds the WARMUP_MAX_LIMIT
      d.daily_limit = Math.min(autoScaledLimit, maxLimit);
    }
    await d.save();
  }
  console.log("🔄 Daily counters and limits reset successfully.");
});

// ================= API =================

// create client
app.post('/client/create', async (req, res) => {
  const { name, email } = req.body;
  const client = await Client.create({
    name,
    email,
    api_key: generateApiKey()
  });
  res.json(client);
});


app.post('/domain/add', async (req, res) => {

  try {

    const {
      client_id,
      domain
    } = req.body;

    // verify domain

    try {

      const identity =
        await sesv2.getEmailIdentity({
          EmailIdentity: domain
        }).promise();

      if (!identity.VerifiedForSendingStatus) {

        return res.status(400).json({
          error: "Domain is not verified in SES"
        });

      }

    } catch (err) {

      return res.status(400).json({
        error: "Domain identity not found in SES"
      });

    }

    // check duplicate

    const existing =
      await Domain.findOne({ domain });

    if (existing) {

      return res.status(400).json({
        error: "Domain already added"
      });

    }

    // config set

    const configSet =
      `mailwarm-${domain.replace(/\./g, '-')}`;

    try {

      await sesv2.createConfigurationSet({
        ConfigurationSetName: configSet
      }).promise();

    } catch (err) {

      if (
        err.code !== 'AlreadyExistsException' &&
        err.code !== 'ConfigurationSetAlreadyExistsException'
      ) {

        throw err;

      }

      console.log(
        "⚠️ Config set already exists"
      );

    }

    // save domain

    await Domain.create({

      client_id,

      domain,

      config_set: configSet,

      daily_limit:
        parseInt(
          process.env.WARMUP_WEEK_1_LIMIT
        ) || 20,

      sent_today: 0,

      status: "active",

      metrics: {

        bounce_rate: 0,

        complaint_rate: 0,

        delivery_rate: 0,

        health_score: 100

      }

    });

    res.json({

      success: true,

      message:
        "Domain added successfully"

    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }

});


// delete domain
app.post('/domain/delete', async (req, res) => {
  try {
    const { domain } = req.body;
    await Domain.deleteOne({ domain });
    console.log(`🗑️ Deleted domain ${domain}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// add seed inbox
app.post('/seed/add', async (req, res) => {
  const { email } = req.body;
  await SeedInbox.create({ email, active: true });
  res.json({ success: true });
});

// dashboard
app.get('/dashboard', async (req, res) => {
  try {
    const domains = await Domain.find();
    const output = domains.map(d => ({
      domain: d.domain,
      status: d.status,
      metrics: d.metrics || {},
      daily_limit: d.daily_limit,
      sent_today: d.sent_today
    }));
    res.json({ domains: output });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// client domains
app.get('/client/:id/domains', async (req, res) => {
  const data = await Domain.find({ client_id: req.params.id });
  res.json(data);
});

// resume
app.post('/domain/resume', async (req, res) => {
  const { domain } = req.body;
  await Domain.updateOne({ domain }, { status: "active" });
  res.json({ success: true });
});

// pause
app.post('/domain/pause', async (req, res) => {
  try {
    const { domain } = req.body;
    await Domain.updateOne({ domain }, { status: "paused" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// health
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// ================= SERVER =================

app.listen(3000, () => {
  console.log("🚀 Multi-client Mailwarm backend running on port 3000");
});
