const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;
require('dotenv').config();
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// middle ware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(403)
      .send({ error: true, message: 'unauthorizaied access' });
  }
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decode) => {
    if (err) {
      return res
        .status(403)
        .send({ error: true, message: 'unauthorizad access' });
    }
    req.decode = decode;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mrvtr8q.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const spcialDoctorCollection = client
      .db('dochouseDB')
      .collection('doctors');
    const doctorsColection = client.db('dochouseDB').collection('allDoctors');
    const serviceColection = client.db('dochouseDB').collection('services');
    const appointmentColection = client
      .db('dochouseDB')
      .collection('appointments');
    const userColection = client.db('dochouseDB').collection('users');

    // jwt apis sign in
    app.post('/jwt', (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN, {
        expiresIn: '1h',
      });
      res.send({ token });
    });

    // admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decode.email;
      const query = { email: email };
      const user = await userColection.findOne(query);
      if (user?.role !== 'admin') {
        return res
          .status(403)
          .send({ error: true, message: 'forbidden access' });
      }
      next();
    };

    // doctor apis
    app.post('/add-doctors', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorsColection.insertOne(doctor);
      res.send(result);
    });

    app.get('/all-doctors', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await doctorsColection.find().toArray();
      res.send(result);
    });

    app.delete(
      '/delete-doctors/:id',
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await doctorsColection.deleteOne(query);
        res.send(result);
      }
    );

    // spcial Doctor apis

    app.post('/doctors', verifyJWT, async (req, res) => {
      const doctor = req.body;
      const result = await spcialDoctorCollection.insertOne(doctor);
      res.send(result);
    });

    app.get('/doctors', async (req, res) => {
      const datas = spcialDoctorCollection.find();
      const result = await datas.toArray();
      res.send(result);
    });

    app.get('/doctors/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await spcialDoctorCollection.findOne(query);
      res.send(result);
    });

    // service apis
    app.get('/services', async (req, res) => {
      const result = await serviceColection.find().toArray();
      res.send(result);
    });

    // appointments apis
    app.post('/appointments', verifyJWT, async (req, res) => {
      const appontment = req.body;
      const result = await appointmentColection.insertOne(appontment);
      res.send(result);
    });

    app.get('/appointments', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decode = req.decode;

      const filter = { email: email };
      const admin = await userColection.findOne(filter);
      const isAdmin = admin.role === 'admin';

      if (isAdmin) {
        const result = await appointmentColection.find().toArray();
        res.send(result);
        return;
      }

      if (email !== decode.email) {
        return res
          .status(401)
          .send({ error: true, message: 'forbidden access' });
      }
      let query = {};
      if (query) {
        query = { email: email };
      }
      const result = await appointmentColection.find(query).toArray();
      res.send(result);
    });

    app.patch('/appointments/:id', async (req, res) => {
      const id = req.params.id;
      const { tranjactionId } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedStatus = {
        $set: {
          status: 'paid',
          tranjactionId,
        },
      };
      const result = await appointmentColection.updateOne(
        filter,
        updatedStatus
      );
      res.send(result);
    });

    // users apis here
    app.post('/users', async (req, res) => {
      const data = req.body;

      const query = { email: data.email };
      const user = await userColection.findOne(query);
      if (data.email === user?.email) {
        return res.send({});
      }
      const result = await userColection.insertOne(data);
      res.send(result);
    });

    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userColection.find().toArray();
      res.send(result);
    });

    app.patch('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedUser = {
        $set: {
          role: 'admin',
        },
      };
      const result = await userColection.updateOne(query, updatedUser);
      res.send(result);
    });

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userColection.deleteOne(query);
      res.send(result);
    });

    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userColection.findOne(query);
      const result = { admin: user?.role === 'admin' };
      res.send(result);
    });

    // stripe secret key api
    app.post('/stripe-key', verifyJWT, async (req, res) => {
      const { price } = req.body;
      if (price) {
        const amount = price * 100;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',

          payment_method_types: ['card'],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('server is running');
});

app.listen(port, () => {
  console.log('server is running on port', port);
});
