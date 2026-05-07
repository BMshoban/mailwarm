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
  metrics: Object
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

  const start = new Date(
    end.getTime() - 24 * 60 * 60 * 1000
  );

  const names = [
    "Send",
    "Delivery",
    "Bounce",
    "Complaint"
  ];

  const results = {};

  for (const name of names) {

    const data =
      await cloudwatch.getMetricStatistics({

        Namespace: "AWS/SES",

        MetricName: name,

        Dimensions: [
          {
            Name: "ConfigurationSet",
            Value: configSet
          }
        ],

        StartTime: start,
        EndTime: end,

        Period: 86400,

        Statistics: ["Sum"]

      }).promise();

    results[name] =
      data.Datapoints[0]?.Sum || 0;
  }

  const sent = results.Send || 1;

  return {

    bounce_rate:
      (results.Bounce / sent) * 100,

    complaint_rate:
      (results.Complaint / sent) * 100,

    delivery_rate:
      (results.Delivery / sent) * 100

  };
}

// ================= ENGINE =================

class WarmupEngine {

  async sendWarmup(domainObj) {

    if (domainObj.status === "paused") {
      return;
    }

    if (
      domainObj.sent_today >=
      domainObj.daily_limit
    ) {
      return;
    }

    const seeds =
      await SeedInbox.find({
        active: true
      });

    if (!seeds.length) {

      console.log("❌ No seed inboxes");

      return;
    }

    const remaining =
      domainObj.daily_limit -
      domainObj.sent_today;

    const batch =
      Math.min(10, remaining);

    for (let i = 0; i < batch; i++) {

      const target =
        seeds[
          Math.floor(
            Math.random() * seeds.length
          )
        ];

      console.log(
        `📨 Sending email to ${target.email}`
      );

      await ses.sendEmail({

        Source:
          `"Warmup" <${process.env.SES_FROM_EMAIL}>`,

        Destination: {
          ToAddresses: [target.email]
        },

        Message: {

          Subject: {
            Data: this.randomSubject()
          },

          Body: {

            Html: {
              Data: `
                <html>
                  <body>
                    <p>${this.randomBody()}</p>

                    <a href="https://google.com">
                      Click Here
                    </a>
                  </body>
                </html>
              `
            }

          }

        },

        ConfigurationSetName:
          domainObj.config_set

      }).promise();

      console.log("✅ Email delivered");

      await this.delay();
    }

    domainObj.sent_today += batch;

    await domainObj.save();
  }

  async checkMetrics(domainObj) {

    const metrics =
      await getSESMetrics(
        domainObj.config_set
      );

    domainObj.metrics = metrics;

    // 🚨 Pause domain
    if (
      metrics.bounce_rate > 2 ||
      metrics.complaint_rate > 0.1
    ) {

      domainObj.status = "paused";

      console.log(
        `🚨 Paused ${domainObj.domain}`
      );

      await domainObj.save();

      return;
    }

    // 🚀 Auto scale
    if (
      metrics.delivery_rate > 95 &&
      metrics.bounce_rate < 1
    ) {

      domainObj.daily_limit += 20;

      if (domainObj.daily_limit > 2000) {
        domainObj.daily_limit = 2000;
      }

      console.log(
        `🚀 Scaling ${domainObj.domain} → ${domainObj.daily_limit}`
      );
    }

    await domainObj.save();
  }

  randomSubject() {

    const subjects = [
      "Quick question",
      "Checking in",
      "Follow up"
    ];

    return subjects[
      Math.floor(
        Math.random() * subjects.length
      )
    ];
  }

  randomBody() {

    const bodies = [
      "Hey, just checking if you saw this.",
      "Following up on this.",
      "Let me know your thoughts."
    ];

    return bodies[
      Math.floor(
        Math.random() * bodies.length
      )
    ];
  }

  async delay() {

    const ms =
      Math.floor(Math.random() * 3000) + 1000;

    return new Promise(resolve =>
      setTimeout(resolve, ms)
    );
  }
}

const engine = new WarmupEngine();

// ================= CRON =================

// send every minute

cron.schedule('*/1 * * * *', async () => {

  const domains =
    await Domain.find({
      status: "active"
    });

  for (const d of domains) {

    console.log(
      `🚀 Sending warmup for ${d.domain}`
    );

    await engine.sendWarmup(d);

    console.log(
      `✅ Warmup completed for ${d.domain}`
    );
  }

});

// metrics check every 6 hours

cron.schedule('0 */6 * * *', async () => {

  const domains =
    await Domain.find();

  for (const d of domains) {

    await engine.checkMetrics(d);

  }

});

// reset counters daily

cron.schedule('0 0 * * *', async () => {

  await Domain.updateMany(
    {},
    {
      sent_today: 0
    }
  );

  console.log("🔄 Daily counters reset");

});

// ================= API =================

// create client

app.post('/client/create', async (req, res) => {

  const { name, email } = req.body;

  const client =
    await Client.create({

      name,
      email,

      api_key:
        generateApiKey()

    });

  res.json(client);

});

// add domain

app.post('/domain/add', async (req, res) => {

  try {

    const {
      client_id,
      domain
    } = req.body;

    const configSet =
      `mailwarm-${domain.replace(/\./g, '-')}`;

    try {

      await sesv2.createConfigurationSet({

        ConfigurationSetName:
          configSet

      }).promise();

    } catch (err) {

      if (
        err.code !==
          'AlreadyExistsException' &&
        err.code !==
          'ConfigurationSetAlreadyExistsException'
      ) {

        throw err;
      }

      console.log(
        "⚠️ Config set already exists"
      );
    }

    await Domain.create({

      client_id,
      domain,

      config_set:
        configSet,

      daily_limit: 20,

      sent_today: 0,

      status: "active",

      metrics: {}

    });

    res.json({
      success: true
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }

});

// add seed inbox

app.post('/seed/add', async (req, res) => {

  const { email } = req.body;

  await SeedInbox.create({

    email,
    active: true

  });

  res.json({
    success: true
  });

});

// dashboard

app.get('/dashboard', async (req, res) => {

  try {

    const domains =
      await Domain.find();

    const output =
      domains.map(d => ({

        domain: d.domain,

        status: d.status,

        bounce_rate:
          d.metrics?.bounce_rate || 0,

        spam_rate:
          d.metrics?.complaint_rate || 0,

        delivery_rate:
          d.metrics?.delivery_rate || 0,

        daily_limit:
          d.daily_limit,

        sent_today:
          d.sent_today

      }));

    res.json({
      domains: output
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }

});

// client domains

app.get('/client/:id/domains', async (req, res) => {

  const data =
    await Domain.find({
      client_id: req.params.id
    });

  res.json(data);

});

// resume domain

app.post('/domain/resume', async (req, res) => {

  const { domain } = req.body;

  await Domain.updateOne(

    { domain },

    {
      status: "active"
    }

  );

  res.json({
    success: true
  });

});

// health

app.get('/health', (req, res) => {

  res.json({
    status: "ok"
  });

});

app.post('/domain/pause', async (req, res) => {

  try {

    const { domain } = req.body;

    await Domain.updateOne(

      { domain },

      {
        status: "paused"
      }

    );

    res.json({
      success: true
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }

});

// ================= SERVER =================

app.listen(3000, () => {

  console.log(
    "🚀 Multi-client Mailwarm running"
  );

});
