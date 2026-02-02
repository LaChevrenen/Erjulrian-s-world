const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    floor: {
        type: Number,
        required: true
    },
    room: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['combat', 'elite-combat', 'rest', 'boss'],
        required: true
    },
    monsterId: {
        type: String,
        default: null
    },
    visited: {
        type: Boolean,
        default: false
    }
});

const positionSchema = new mongoose.Schema({
    floor: {
        type: Number,
        required: true,
        default: 0
    },
    room: {
        type: Number,
        required: true,
        default: 0
    }
});

const dungeonSchema = new mongoose.Schema({
    heroId: {
        type: String,
        required: true,
        index: true
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    finishedAt: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['in_progress', 'completed', 'failed', 'abandoned'],
        default: 'in_progress'
    },
    position: {
        type: positionSchema,
        required: true,
        default: { floor: 0, room: 0 }
    },
    rooms: {
        type: [roomSchema],
        default: []
    },
    visitedRooms: {
        type: [roomSchema],
        default: []
    }
}, { timestamps: true });

module.exports = mongoose.model('DungeonRun', dungeonSchema);
