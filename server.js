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
    sourceUrl: {
        type: String,
        required: true,
        index: true
    },
    phone: [{
        type: String
    }],
    email: [{
        type: String
    }],
    otherLinks: [{
        url: String,
        text: String,
        matchedKeywords: [String]
    }],
    savedAt: {
        type: Date,
        default: Date.now
    }
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
        console.log('Received data:', req.body);
        const { sourceUrl, phone, email, otherLinks } = req.body;

        if (!sourceUrl) {
            return res.status(400).json({
                success: false,
                error: 'Missing sourceUrl'
            });
        }

        // Format the data
        const formattedData = {
            sourceUrl,
            phone: Array.isArray(phone) ? phone : [],
            email: Array.isArray(email) ? email : [],
            otherLinks: Array.isArray(otherLinks) ? otherLinks : []
        };

        console.log('Formatted data:', formattedData);

        // Check if entry already exists for this URL
        let contact = await Contact.findOne({ sourceUrl });

        if (contact) {
            // Update existing entry
            if (formattedData.phone.length > 0) {
                contact.phone = [...new Set([...contact.phone, ...formattedData.phone])];
            }
            if (formattedData.email.length > 0) {
                contact.email = [...new Set([...contact.email, ...formattedData.email])];
            }
            if (formattedData.otherLinks.length > 0) {
                contact.otherLinks = [...contact.otherLinks, ...formattedData.otherLinks];
            }
            contact.savedAt = new Date();
        } else {
            // Create new entry
            contact = new Contact(formattedData);
        }

        await contact.save();
        console.log('Saved contact:', contact);

        res.status(201).json({
            success: true,
            data: contact
        });
    } catch (error) {
        console.error('Error saving contact:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
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

// Get contact by URL
app.get('/rest/api/contacts/url/:url', async (req, res) => {
    try {
        const contact = await Contact.findOne({ sourceUrl: req.params.url });

        if (!contact) {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }

        res.json({
            success: true,
            data: contact
        });
    } catch (error) {
        console.error('Error fetching contact:', error);
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