const API_ENDPOINT = "/api/term/explain";
const TRANSLATE_ENDPOINT = "/api/translate";

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

const startBtn = document.getElementById("start");

const clearBtn = document.getElementById("clear");
const inputLanguageSelect = document.getElementById("inputLanguage");
const userLanguageSelect = document.getElementById("userLanguage");
const supportedLanguages = new Set(Array.from(inputLanguageSelect.options, option => option.value));

const finalElement = document.getElementById("final");
const summaryElement = document.getElementById("page-summary");
const interimElement = document.getElementById("interim");
const statusElement = document.getElementById("status");

const selectedElement = document.getElementById("selectedTerm");
const responseElement = document.getElementById("response");
const deleteExplanationBtn = document.getElementById("deleteExplanation");
let activeExplanationKey = null;
let explanationRequest = 0;
const savedExplanations = new Map();
const pendingExplanations = new Map();
const requestedExplanations = new Map();
let storageGeneration = 0;
let savedMarks = [];
const translatedSegments = new Map();
const pendingSegmentTranslations = new Map();
const segmentTranslationElements = new WeakMap();

const explanation = document.getElementById("explanation");
let selectedRange = null;

let selectionTimer;

let startedInTranscript = false;
