const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Contact Schema
const contactSchema = new mongoose.Schema({
    type: { type: String, enum: ['email', 'phone'], required: true },
    value: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    website: {
        url: String,
        title: String,
        favicon: String
    },
    savedAt: { type: Date, default: Date.now }
});

const Contact = mongoose.model('Contact', contactSchema);

// Routes
app.get('/start', (req, res) => {
    res.json({
        status: 'success',
        message: 'Server is up and running',
        timestamp: new Date().toISOString()
    });
});

// Save contact to dashboard
app.post('/rest/api/contacts', async (req, res) => {
    try {
        const { type, value, sourceUrl, website } = req.body;

        if (!type || !value || !sourceUrl) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        const contact = new Contact({
            type,
            value,
            sourceUrl,
            website,
            savedAt: new Date()
        });

        await contact.save();
        res.status(201).json({
            success: true,
            data: contact
        });
    } catch (error) {
        console.error('Error saving contact:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get all contacts
app.get('/rest/api/contacts', async (req, res) => {
    try {
        const contacts = await Contact.find()
            .sort({ savedAt: -1 })
            .limit(100);

        res.json({
            success: true,
            data: contacts
        });
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get contacts by type
app.get('/rest/api/contacts/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const contacts = await Contact.find({ type })
            .sort({ savedAt: -1 })
            .limit(100);

        res.json({
            success: true,
            data: contacts
        });
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 