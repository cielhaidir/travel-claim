# WhatsApp AI Agent Design - Travel and Claim System

## Document Overview

**Project:** Travel and Claim Management System - WhatsApp AI Agent Integration  
**Version:** 1.0  
**Last Updated:** 2026-02-06  
**Status:** Design Specification

**References:**
- Architecture: [`architecture.md`](architecture.md:1)
- Database Schema: [`travel-claim/prisma/schema.prisma`](travel-claim/prisma/schema.prisma:1)
- Authentication: [`AUTH_DESIGN.md`](AUTH_DESIGN.md:1)
- API Design: [`API_DESIGN.md`](API_DESIGN.md:1)
- Frontend Design: [`FRONTEND_DESIGN.md`](FRONTEND_DESIGN.md:1)

---

## 1. Executive Summary

### 1.1 Purpose

This document defines the complete WhatsApp AI Agent integration architecture that enables users to submit expense claims via WhatsApp with AI-powered assistance. The agent analyzes receipt images, extracts data, validates information, and submits claims to the Travel and Claim Management System.

### 1.2 Scope

**In Scope:**
- Custom WhatsApp instance webhook integration with n8n
- AI-powered conversation management (OpenAI GPT-4 Vision/GPT-4o)
- OCR and receipt data extraction
- Interactive form-based data collection
- Integration with existing tRPC API endpoints
- Support for both entertainment and non-entertainment claims
- Bilingual support (Indonesian and English)
- State management and session handling
- Security and authentication
- Deployment and monitoring strategy

**Out of Scope:**
- Alternative WhatsApp integration methods (Cloud API, Business API, third-party services)
- Voice message processing
- Video attachments
- Group chat support (Phase 1 - individual chats only)

### 1.3 Key Features

✅ **Receipt Image Analysis** - Automatic OCR and data extraction from receipt images  
✅ **Intelligent Conversations** - AI-guided data collection with context awareness  
✅ **Travel Request Lookup** - Query user's approved travel requests  
✅ **Interactive Validation** - Confirm extracted data with users  
✅ **Seamless Integration** - Direct submission to main system via tRPC  
✅ **Bilingual Support** - Indonesian and English language handling  
✅ **Error Recovery** - Graceful handling of errors with user guidance

---

## 2. Architecture Overview

### 2.1 High-Level Architecture

```mermaid
graph TB
    User[WhatsApp User] -->|Send Message + Image| WA[Custom WhatsApp Instance]
    WA -->|Webhook POST| N8N[n8n Automation Platform]
    
    N8N -->|1. Store Session| SessionDB[(Session Context)]
    N8N -->|2. Analyze Intent| AI[OpenAI GPT-4 Vision API]
    N8N -->|3. Extract Receipt Data| OCR[OCR + Vision Analysis]
    N8N -->|4. Query Travel Requests| API1[GET /api/webhooks/n8n/travel-requests]
    N8N -->|5. Submit Claim| API2[POST /api/webhooks/n8n/claims]
    N8N -->|6. Upload Attachment| API3[POST /api/trpc/attachment.getUploadUrl]
    
    API1 --> NextJS[Next.js Application]
    API2 --> NextJS
    API3 --> NextJS
    
    NextJS --> DB[(PostgreSQL)]
    NextJS --> Storage[File Storage R2/Local]
    
    N8N -->|Send Reply| WA
    WA -->|Deliver Message| User
    
    AI -.->|Function Calls| N8N
    OCR -.->|Structured Data| N8N
```

### 2.2 Component Breakdown

#### WhatsApp Layer
- **Custom WhatsApp Instance**: User's existing WhatsApp integration
- **Responsibilities**: Receive messages, send messages, handle media
- **Constraints**: HMAC auth, 50 msg/sec rate limit, 15-min media URL expiry

#### Orchestration Layer (n8n)
- **n8n Workflow Engine**: Central orchestration and business logic
- **Responsibilities**:
  - Webhook intake and validation
  - Session state management
  - AI conversation orchestration
  - API integration with main system
  - Error handling and retry logic

#### AI Layer
- **OpenAI GPT-4 Vision / GPT-4o**: Primary AI engine
- **Responsibilities**:
  - Natural language understanding
  - Intent recognition
  - Receipt image analysis
  - Data extraction and validation
  - Conversation context management
  - Function calling for structured outputs

#### Integration Layer
- **Next.js Application**: Main travel and claim system
- **tRPC API Endpoints**: Type-safe API integration
- **Responsibilities**:
  - Travel request data retrieval
  - Claim submission and validation
  - Attachment storage management
  - User authentication and authorization

### 2.3 Data Flow

```mermaid
sequenceDiagram
    participant User
    participant WA as WhatsApp Instance
    participant N8N as n8n
    participant AI as OpenAI API
    participant System as Next.js System
    
    User->>WA: Send receipt image
    WA->>N8N: Webhook with media URL
    N8N->>N8N: Verify HMAC signature
    N8N->>N8N: Load/create session context
    
    N8N->>AI: Analyze image with GPT-4 Vision
    AI->>N8N: Extracted data + confidence
    
    N8N->>AI: Determine missing fields
    AI->>N8N: Required questions list
    
    N8N->>WA: Ask user for confirmation
    WA->>User: Display extracted data
    
    User->>WA: Confirm amount and details
    WA->>N8N: User confirmation
    
    N8N->>AI: Determine claim type
    AI->>N8N: Entertainment or Non-Entertainment
    
    N8N->>System: GET travel requests for user
    System->>N8N: List of approved trips
    
    N8N->>WA: Show travel options
    WA->>User: Select trip
    
    User->>WA: Select Trip 1
    WA->>N8N: Trip selection
    
    N8N->>System: POST claim submission
    System->>N8N: Claim ID + success
    
    N8N->>WA: Confirmation message
    WA->>User: Claim submitted successfully
```

### 2.4 Deployment Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                     External Services                            │
├─────────────────────────────────────────────────────────────────┤
│  WhatsApp Instance     │   OpenAI API      │   Storage (R2)     │
│  (User's server)       │   (Cloud)         │   (Cloud/VPS)      │
└────────┬───────────────┴────────┬──────────┴────────────────────┘
         │                        │
         │ Webhook                │ API Calls
         │                        │
┌────────▼────────────────────────▼──────────────────────────────┐
│                    VPS Server / Docker Host                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  n8n Container (Port 5678)                              │   │
│  │  - Webhook endpoints                                     │   │
│  │  - Workflow engine                                       │   │
│  │  - Session state management                              │   │
│  │  - AI orchestration                                      │   │
│  └──────────────────┬──────────────────────────────────────┘   │
│                     │                                            │
│                     │ HTTP/tRPC                                  │
│                     │                                            │
│  ┌──────────────────▼─────────────────────────────────────┐   │
│  │  Next.js Application (Port 3000)                        │   │
│  │  - tRPC API endpoints                                   │   │
│  │  - Webhook handlers                                     │   │
│  │  - Business logic                                       │   │
│  │  - Authentication                                       │   │
│  └──────────────────┬──────────────────────────────────────┘   │
│                     │                                            │
│  ┌──────────────────▼─────────────────────────────────────┐   │
│  │  PostgreSQL Container (Port 5432)                       │   │
│  │  - User data                                            │   │
│  │  - Claims and travel requests                           │   │
│  │  - Session state (WhatsAppSession)                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Redis Container (Optional, Port 6379)                  │   │
│  │  - Session caching                                       │   │
│  │  - Rate limiting                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. WhatsApp + n8n Integration Design

### 3.1 Custom WhatsApp Instance Webhook Contract

#### Webhook Payload Specification

**Endpoint:** `https://n8n.yourdomain.com/webhook/whatsapp-claim`  
**Method:** POST  
**Content-Type:** `application/json`

**Request Body:**
```typescript
interface WhatsAppWebhookPayload {
  // Message metadata
  messageId: string;           // Unique message identifier
  timestamp: number;           // Unix timestamp (milliseconds)
  
  // Sender information
  from: string;                // Phone number with country code (e.g., "+6281234567890")
  fromName?: string;           // Display name if available
  
  // Message content
  type: 'text' | 'image' | 'document';
  text?: string;               // Text content (if type is text)
  
  // Media information (if type is image or document)
  media?: {
    url: string;               // Direct download URL (valid for 15 minutes)
    mimeType: string;          // e.g., "image/jpeg", "image/png", "application/pdf"
    filename?: string;         // Original filename if available
    fileSize?: number;         // File size in bytes
  };
  
  // Quote/reply context
  quotedMessageId?: string;    // If replying to a previous message
  
  // Webhook authentication
  signature: string;           // HMAC-SHA256 signature of the payload
}
```

**Example Payload:**
```json
{
  "messageId": "msg_abc123xyz789",
  "timestamp": 1738838400000,
  "from": "+6281234567890",
  "fromName": "John Doe",
  "type": "image",
  "text": "Here is my taxi receipt",
  "media": {
    "url": "https://whatsapp-media.example.com/files/abc123.jpg",
    "mimeType": "image/jpeg",
    "filename": "receipt.jpg",
    "fileSize": 245678
  },
  "signature": "8f7d9c2e1a3b5f6..."
}
```

#### HMAC Signature Verification

**Algorithm:** HMAC-SHA256  
**Secret Key:** Shared between WhatsApp instance and n8n (environment variable)

**Calculation:**
```typescript
// Pseudo-code for signature generation
const payload = JSON.stringify({
  messageId,
  timestamp,
  from,
  type,
  text,
  media
});

const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');
```

**Verification in n8n:**
```javascript
// n8n Function Node
const crypto = require('crypto');

const payload = JSON.stringify({
  messageId: $json.messageId,
  timestamp: $json.timestamp,
  from: $json.from,
  type: $json.type,
  text: $json.text,
  media: $json.media
});

const expectedSignature = crypto
  .createHmac('sha256', $env.WHATSAPP_WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');

if (expectedSignature !== $json.signature) {
  throw new Error('Invalid webhook signature');
}

return { verified: true };
```

### 3.2 n8n Webhook Configuration

#### Webhook Trigger Node Setup

```javascript
// n8n Webhook Node Configuration
{
  "path": "whatsapp-claim",
  "method": "POST",
  "authentication": "none", // HMAC handled in function node
  "responseMode": "lastNode",
  "responseCode": 200,
  "options": {
    "rawBody": false
  }
}
```

#### Rate Limiting Strategy

**Constraint:** 50 messages/second from WhatsApp instance

**Implementation:**
- n8n built-in rate limiter: Max 40 req/sec (80% of limit for safety)
- Queue overflow handling: Return 202 Accepted, process async
- Redis-based distributed rate limiting if scaling to multiple n8n instances

```javascript
// n8n Rate Limiter Node (using Redis)
const redis = require('redis');
const client = redis.createClient({ url: $env.REDIS_URL });

const key = `rate_limit:whatsapp:${$json.from}`;
const current = await client.incr(key);
await client.expire(key, 1); // 1 second window

if (current > 10) { // Max 10 messages per user per second
  return {
    status: 429,
    message: 'Rate limit exceeded. Please wait a moment.'
  };
}
```

### 3.3 Media Handling

#### Media Download Flow

**Challenge:** Media URLs expire in 15 minutes  
**Solution:** Immediate download and storage

```javascript
// n8n HTTP Request Node - Download Media
{
  "url": "={{$json.media.url}}",
  "method": "GET",
  "responseFormat": "file",
  "options": {
    "timeout": 30000,
    "followRedirects": true
  }
}
```

#### Media Storage Strategy

**Option 1: Temporary Storage (Recommended for Phase 1)**
```javascript
// n8n Write Binary File Node
{
  "fileName": "={{$json.messageId}}_{{$json.media.filename}}",
  "dataPropertyName": "data",
  "options": {
    "mode": "temp" // Store in n8n temp directory
  }
}
```

**Option 2: Direct Upload to System**
```javascript
// Flow:
// 1. Download media from WhatsApp URL
// 2. Get presigned upload URL from system
// 3. Upload to R2/Storage
// 4. Confirm upload with system
// 5. Store storage URL in session context
```

### 3.4 Message Sending

#### Send Message to WhatsApp Instance

**Endpoint:** `https://whatsapp-instance.example.com/api/send`  
**Method:** POST  
**Authentication:** Bearer token or API key

```typescript
interface SendMessageRequest {
  to: string;                  // Phone number
  type: 'text' | 'template';
  text?: string;               // For type: text
  template?: {                 // For type: template
    name: string;
    language: string;
    components: any[];
  };
}
```

**n8n HTTP Request Node:**
```javascript
{
  "url": "{{$env.WHATSAPP_API_URL}}/api/send",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{$env.WHATSAPP_API_KEY}}",
    "Content-Type": "application/json"
  },
  "body": {
    "to": "={{$json.from}}",
    "type": "text",
    "text": "={{$json.aiResponse}}"
  }
}
```

#### Template Messages

**Use Cases:**
- Initial greeting
- Confirmation messages
- Error messages
- Status updates

**Example Templates:**
```javascript
// Welcome Template
{
  "to": "+6281234567890",
  "type": "text",
  "text": "Hi! 👋 I'm your travel claim assistant. Send me a receipt image and I'll help you submit your claim."
}

// Claim Submitted Template
{
  "to": "+6281234567890",
  "type": "text",
  "text": "✅ Your claim has been submitted successfully!\n\n📋 Claim ID: CLM-202602-0123\n💰 Amount: Rp 250,000\n\nYour manager will review it shortly."
}
```

---

## 4. AI Agent Architecture

### 4.1 Conversation State Machine

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> ReceiptAnalysis: Receipt image received
    Idle --> Query: Text query received
    
    ReceiptAnalysis --> DataExtraction: Image downloaded
    DataExtraction --> ValidationPending: Data extracted
    ValidationPending --> DataConfirmed: User confirms
    ValidationPending --> DataCorrected: User corrects
    DataCorrected --> DataConfirmed: Corrections applied
    
    DataConfirmed --> ClaimTypeSelection: Ask claim type
    ClaimTypeSelection --> TravelRequestLookup: Type selected
    TravelRequestLookup --> TravelRequestSelection: Trips retrieved
    TravelRequestSelection --> AdditionalFieldsCollection: Trip selected
    
    AdditionalFieldsCollection --> FinalConfirmation: All fields collected
    FinalConfirmation --> Submitting: User confirms
    Submitting --> Success: Claim created
    Submitting --> Error: Submission failed
    
    Success --> Idle
    Error --> AdditionalFieldsCollection: Retry with corrections
    Error --> Idle: User cancels
    
    Query --> Idle: Response sent
```

#### State Definitions

```typescript
enum ConversationState {
  IDLE = 'idle',
  RECEIPT_ANALYSIS = 'receipt_analysis',
  DATA_EXTRACTION = 'data_extraction',
  VALIDATION_PENDING = 'validation_pending',
  DATA_CONFIRMED = 'data_confirmed',
  CLAIM_TYPE_SELECTION = 'claim_type_selection',
  TRAVEL_REQUEST_LOOKUP = 'travel_request_lookup',
  TRAVEL_REQUEST_SELECTION = 'travel_request_selection',
  ADDITIONAL_FIELDS_COLLECTION = 'additional_fields_collection',
  FINAL_CONFIRMATION = 'final_confirmation',
  SUBMITTING = 'submitting',
  SUCCESS = 'success',
  ERROR = 'error',
}

interface SessionContext {
  sessionId: string;
  userId: string;
  phoneNumber: string;
  state: ConversationState;
  language: 'id' | 'en';
  
  // Extracted data
  extractedData?: {
    amount?: number;
    date?: string;
    merchant?: string;
    description?: string;
    confidence?: number;
  };
  
  // User selections
  claimType?: 'ENTERTAINMENT' | 'NON_ENTERTAINMENT';
  selectedTravelRequestId?: string;
  
  // Additional fields
  additionalFields?: Record<string, any>;
  
  // Conversation history
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  expiresAt: number; // 24 hours from last activity
}
```

### 4.2 Prompt Engineering Strategy

#### System Prompt

```typescript
const SYSTEM_PROMPT = `You are a helpful travel expense claim assistant for a company's Travel and Claim Management System. Your role is to:

1. Analyze receipt images and extract expense information
2. Guide users through the claim submission process
3. Ask clarifying questions to collect required information
4. Validate data and ensure accuracy
5. Provide friendly and professional assistance

IMPORTANT RULES:
- Always be polite and professional
- Speak in Indonesian or English based on user's language
- Keep responses concise and clear
- Focus on one question at a time
- Provide examples when asking for information
- Confirm extracted data with users before proceeding
- Handle errors gracefully with helpful guidance

CLAIM TYPES:
1. ENTERTAINMENT: Meals, gifts, hospitality for clients/guests
   - Required: Guest name, guest company, date, location, amount
   
2. NON_ENTERTAINMENT: Transport, accommodation, phone bills, equipment
   - Required: Category, date, destination, amount, customer name (if applicable)

PROCESS FLOW:
1. Receive receipt image
2. Extract and confirm data (amount, date, merchant)
3. Ask for claim type
4. Show approved travel requests
5. Collect type-specific required fields
6. Show summary and confirm
7. Submit claim

Use function calling to:
- Extract structured data from receipts
- Query approved travel requests
- Submit claims
- Store conversation state`;
```

#### Function Calling Definitions

```typescript
const FUNCTION_DEFINITIONS = [
  {
    name: 'extract_receipt_data',
    description: 'Extract structured data from a receipt image',
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Total amount from receipt'
        },
        date: {
          type: 'string',
          description: 'Date from receipt in YYYY-MM-DD format'
        },
        merchant: {
          type: 'string',
          description: 'Merchant/vendor name'
        },
        items: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of items/services purchased'
        },
        confidence: {
          type: 'number',
          description: 'Confidence score 0-1 for extraction quality'
        }
      },
      required: ['amount', 'confidence']
    }
  },
  {
    name: 'determine_claim_type',
    description: 'Determine if expense is entertainment or non-entertainment',
    parameters: {
      type: 'object',
      properties: {
        claimType: {
          type: 'string',
          enum: ['ENTERTAINMENT', 'NON_ENTERTAINMENT', 'UNCLEAR'],
          description: 'Type of expense claim'
        },
        reasoning: {
          type: 'string',
          description: 'Explanation for the determination'
        }
      },
      required: ['claimType']
    }
  },
  {
    name: 'collect_missing_fields',
    description: 'Identify which required fields are missing for claim submission',
    parameters: {
      type: 'object',
      properties: {
        missingFields: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of missing required field names'
        },
        nextQuestion: {
          type: 'string',
          description: 'The next question to ask the user'
        }
      },
      required: ['missingFields', 'nextQuestion']
    }
  }
];
```

#### Prompt Templates

**Receipt Analysis Prompt:**
```typescript
const RECEIPT_ANALYSIS_PROMPT = (imageUrl: string) => `
Analyze this receipt image and extract the following information:
- Total amount (required)
- Date of transaction
- Merchant/vendor name
- List of items purchased
- Currency (assume IDR if not specified)

Image URL: ${imageUrl}

Provide a confidence score (0-1) for the extraction quality. If any information is unclear or unreadable, set confidence accordingly and note what's missing.

Use the extract_receipt_data function to return structured data.
`;
```

**Bilingual Response Templates:**
```typescript
const RESPONSE_TEMPLATES = {
  receiptConfirmation: {
    id: `Saya menemukan struk dari *{merchant}* sebesar *Rp {amount}* pada tanggal *{date}*.

Apakah informasi ini sudah benar?
1. Ya, lanjutkan
2. Tidak, ada yang salah`,
    
    en: `I found a receipt from *{merchant}* for *Rp {amount}* dated *{date}*.

Is this information correct?
1. Yes, continue
2. No, something is wrong`
  },
  
  claimTypeQuestion: {
    id: `Jenis pengeluaran apa ini?

1. 🍽️ Hiburan (makan/hadiah untuk tamu)
2. 🚗 Non-hiburan (transport/akomodasi/dll)`,
    
    en: `What type of expense is this?

1. 🍽️ Entertainment (meals/gifts for guests)
2. 🚗 Non-entertainment (transport/accommodation/etc)`
  }
};
```

### 4.3 Context Management

#### Session Storage

**Storage Location:** PostgreSQL (WhatsAppSession table - future schema)  
**Cache Layer:** Redis (optional, for performance)

```typescript
// Session CRUD operations in n8n
interface SessionOperations {
  // Create new session
  create: (phoneNumber: string) => Promise<SessionContext>;
  
  // Load existing session
  load: (phoneNumber: string) => Promise<SessionContext | null>;
  
  // Update session state
  update: (sessionId: string, updates: Partial<SessionContext>) => Promise<void>;
  
  // Add message to history
  addMessage: (sessionId: string, role: 'user' | 'assistant', content: string) => Promise<void>;
  
  // Clear/expire session
  expire: (sessionId: string) => Promise<void>;
}
```

#### Context Window Management

**OpenAI Context Limits:**
- GPT-4 Vision: 128K tokens
- GPT-4o: 128K tokens

**Strategy:**
- Keep last 10 messages in context
- Summarize older messages if history exceeds limit
- Always include system prompt and current state
- Include extracted data and user selections

```javascript
// n8n Function Node - Build AI Context
const buildContext = (session) => {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT }
  ];
  
  // Add state context
  if (session.state !== 'idle') {
    messages.push({
      role: 'system',
      content: `Current state: ${session.state}\nExtracted data: ${JSON.stringify(session.extractedData)}`
    });
  }
  
  // Add recent conversation history (last 10 messages)
  const recentMessages = session.messages.slice(-10);
  messages.push(...recentMessages);
  
  return messages;
};
```

### 4.4 Error Handling and Recovery

#### Error Types and Recovery

```typescript
enum ErrorType {
  IMAGE_DOWNLOAD_FAILED = 'image_download_failed',
  OCR_EXTRACTION_FAILED = 'ocr_extraction_failed',
  LOW_CONFIDENCE_EXTRACTION = 'low_confidence_extraction',
  API_REQUEST_FAILED = 'api_request_failed',
  INVALID_USER_INPUT = 'invalid_user_input',
  NO_APPROVED_TRAVEL_REQUESTS = 'no_approved_travel_requests',
  SUBMISSION_FAILED = 'submission_failed',
}

const ERROR_RECOVERY_STRATEGIES = {
  [ErrorType.IMAGE_DOWNLOAD_FAILED]: {
    retry: true,
    maxRetries: 3,
    fallback: 'Ask user to resend image',
    message: {
      id: 'Maaf, saya tidak bisa mengunduh gambar. Bisa kirim ulang?',
      en: 'Sorry, I couldn\'t download the image. Could you resend it?'
    }
  },
  
  [ErrorType.LOW_CONFIDENCE_EXTRACTION]: {
    retry: false,
    fallback: 'Manual data entry',
    message: {
      id: 'Gambar kurang jelas. Mari isi data secara manual:\n1. Jumlah: ?\n2. Tanggal: ?\n3. Nama toko: ?',
      en: 'Image is unclear. Let\'s enter data manually:\n1. Amount: ?\n2. Date: ?\n3. Merchant: ?'
    }
  },
  
  [ErrorType.NO_APPROVED_TRAVEL_REQUESTS]: {
    retry: false,
    fallback: 'Inform user',
    message: {
      id: 'Maaf, Anda tidak memiliki perjalanan yang disetujui. Silakan buat permohonan perjalanan terlebih dahulu di sistem.',
      en: 'Sorry, you don\'t have any approved travel requests. Please create a travel request first in the system.'
    }
  }
};
```

---

## 5. OCR and Data Extraction

### 5.1 Image Preprocessing Pipeline

```mermaid
graph LR
    A[Receipt Image] --> B[Download]
    B --> C[Format Validation]
    C --> D[Size Check]
    D --> E[Quality Enhancement]
    E --> F[Orientation Correction]
    F --> G[Ready for OCR]
    
    C -->|Invalid| H[Error: Unsupported format]
    D -->|Too large| I[Resize/Compress]
    I --> E
```

#### Preprocessing Steps

```javascript
// n8n Code Node - Image Preprocessing
const sharp = require('sharp');

const preprocessImage = async (imageBuffer) => {
  const metadata = await sharp(imageBuffer).metadata();
  
  // 1. Validate format
  if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
    throw new Error('Unsupported image format');
  }
  
  // 2. Resize if too large (max 4096px)
  let processed = sharp(imageBuffer);
  if (metadata.width > 4096 || metadata.height > 4096) {
    processed = processed.resize(4096, 4096, {
      fit: 'inside',
      withoutEnlargement: true
    });
  }
  
  // 3. Enhance quality
  processed = processed
    .normalize() // Normalize contrast
    .sharpen()   // Sharpen edges
    .toFormat('jpeg', { quality: 90 });
  
  return await processed.toBuffer();
};
```

### 5.2 OCR and Vision Analysis Strategy

#### Primary Method: GPT-4 Vision API

**Advantages:**
- Native image understanding
- Context-aware extraction
- No separate OCR service needed
- High accuracy for receipts
- Multilingual support

**Implementation:**
```javascript
// n8n HTTP Request Node - OpenAI Vision API
{
  "url": "https://api.openai.com/v1/chat/completions",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{$env.OPENAI_API_KEY}}",
    "Content-Type": "application/json"
  },
  "body": {
    "model": "gpt-4-vision-preview", // or "gpt-4o"
    "messages": [
      {
        "role": "system",
        "content": RECEIPT_EXTRACTION_SYSTEM_PROMPT
      },
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Extract all information from this receipt."
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "={{$json.mediaUrl}}", // or base64 encoded image
              "detail": "high"
            }
          }
        ]
      }
    ],
    "functions": [EXTRACT_RECEIPT_DATA_FUNCTION],
    "function_call": { "name": "extract_receipt_data" },
    "max_tokens": 1000,
    "temperature": 0.1 // Low temperature for consistency
  }
}
```

#### Fallback Method: Tesseract OCR + GPT-4

**Use Case:** If Vision API fails or for cost optimization

```javascript
// Step 1: Tesseract OCR
const Tesseract = require('tesseract.js');

const ocrResult = await Tesseract.recognize(
  imageBuffer,
  'eng+ind', // English + Indonesian
  {
    logger: m => console.log(m)
  }
);

const ocrText = ocrResult.data.text;

// Step 2: GPT-4 Text Parsing
const extractionPrompt = `
Extract structured receipt data from this OCR text:

${ocrText}

Extract:
- Total amount
- Date
- Merchant name
- Items purchased
- Any other relevant information

Use the extract_receipt_data function.
`;
```

### 5.3 Data Extraction Schema

```typescript
interface ExtractedReceiptData {
  // Core fields
  amount: number;                    // Required
  currency: string;                  // Default: "IDR"
  date?: string;                     // ISO 8601 date
  merchant?: string;                 // Vendor/store name
  
  // Additional fields
  items?: Array<{
    name: string;
    quantity?: number;
    price?: number;
  }>;
  
  // Tax information
  tax?: number;
  taxPercentage?: number;
  
  // Payment method
  paymentMethod?: 'cash' | 'card' | 'transfer' | 'other';
  
  // Receipt metadata
  receiptNumber?: string;
  location?: string;
  
  // Extraction metadata
  confidence: number;                // 0-1 score
  extractionMethod: 'vision' | 'ocr' | 'manual';
  uncertainFields?: string[];        // Fields with low confidence
  rawText?: string;                  // Full OCR text for reference
}
```

### 5.4 Confidence Scoring and Validation

#### Confidence Calculation

```javascript
// n8n Function Node - Calculate Confidence
const calculateConfidence = (extractedData) => {
  let confidence = 1.0;
  const penalties = [];
  
  // Penalize missing required fields
  if (!extractedData.amount) {
    confidence -= 0.5;
    penalties.push('Missing amount');
  }
  
  // Penalize unclear dates
  if (extractedData.date) {
    const dateValid = !isNaN(new Date(extractedData.date).getTime());
    if (!dateValid) {
      confidence -= 0.2;
      penalties.push('Invalid date format');
    }
  } else {
    confidence -= 0.15;
    penalties.push('Missing date');
  }
  
  // Penalize unclear merchant
  if (!extractedData.merchant || extractedData.merchant.length < 3) {
    confidence -= 0.15;
    penalties.push('Unclear merchant name');
  }
  
  // Penalize if no items extracted
  if (!extractedData.items || extractedData.items.length === 0) {
    confidence -= 0.1;
    penalties.push('No items detected');
  }
  
  return {
    confidence: Math.max(0, confidence),
    penalties,
    needsManualReview: confidence < 0.7
  };
};
```

#### Validation Rules

```typescript
interface ValidationRule {
  field: string;
  validate: (value: any) => boolean;
  errorMessage: { id: string; en: string };
}

const VALIDATION_RULES: ValidationRule[] = [
  {
    field: 'amount',
    validate: (value) => typeof value === 'number' && value > 0 && value < 100000000,
    errorMessage: {
      id: 'Jumlah harus antara Rp 1 dan Rp 100,000,000',
      en: 'Amount must be between Rp 1 and Rp 100,000,000'
    }
  },
  {
    field: 'date',
    validate: (value) => {
      if (!value) return true; // Optional field
      const date = new Date(value);
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      return date >= sixMonthsAgo && date <= now;
    },
    errorMessage: {
      id: 'Tanggal harus dalam 6 bulan terakhir',
      en: 'Date must be within the last 6 months'
    }
  },
  {
    field: 'merchant',
    validate: (value) => !value || (typeof value === 'string' && value.length >= 2),
    errorMessage: {
      id: 'Nama toko minimal 2 karakter',
      en: 'Merchant name must be at least 2 characters'
    }
  }
];
```

---

## 6. Conversation Flows

### 6.1 Complete Receipt Upload Flow

```mermaid
sequenceDiagram
    participant User
    participant AI as AI Agent
    participant System
    
    User->>AI: Send receipt image
    AI->>AI: Download and preprocess
    AI->>AI: Extract data via GPT-4 Vision
    
    alt High Confidence
        AI->>User: Found: Merchant X, Rp 250k, Jan 15<br/>Correct?
        User->>AI: Yes
    else Low Confidence
        AI->>User: Image unclear. Please provide:<br/>1. Amount?
        User->>AI: 250000
        AI->>User: 2. Date?
        User->>AI: 15 Jan 2026
        AI->>User: 3. Merchant?
        User->>AI: Taxi Blue Bird
    end
    
    AI->>User: Expense type?<br/>1. Entertainment<br/>2. Non-entertainment
    User->>AI: 2
    
    AI->>System: GET approved travel requests
    System->>AI: Return travel list
    
    AI->>User: Select trip:<br/>1. Jakarta Jan 15-17<br/>2. Surabaya Jan 20-22
    User->>AI: 1
    
    AI->>User: Expense category?<br/>1. Transport<br/>2. Accommodation<br/>3. Other
    User->>AI: 1
    
    AI->>User: Customer name?
    User->>AI: PT ABC Corp
    
    AI->>User: Summary:<br/>Amount: Rp 250k<br/>Type: Transport<br/>Trip: Jakarta<br/>Customer: PT ABC<br/><br/>Submit?
    User->>AI: Yes
    
    AI->>System: POST claim submission
    System->>AI: Success: CLM-001
    
    AI->>User: Claim submitted!<br/>ID: CLM-001<br/>Manager will review
```

### 6.2 Missing Data Flow

```
User: [Sends blurry receipt]

AI: Analyzing receipt...

AI: I can see it's a receipt, but the image quality is too low to read the details clearly.

Let's enter the information manually:

1️⃣ What is the total amount?

---

User: 350000

---

AI: Great! Rp 350,000 noted.

2️⃣ What date was this expense? (Format: DD/MM/YYYY or just tell me the date)

---

User: 15 January

---

AI: Got it - 15 January 2026.

3️⃣ What is the merchant/vendor name?

---

User: Restoran Padang Sederhana

---

AI: Perfect! Here's what I have:
• Amount: Rp 350,000
• Date: 15 January 2026  
• Merchant: Restoran Padang Sederhana

Is this correct?
1. Yes, continue
2. No, I need to correct something

---

User: 1

---

AI: What type of expense is this?

1. 🍽️ Entertainment (meals/gifts for clients/guests)
2. 🚗 Non-entertainment (transport/accommodation/phone/equipment)

[Flow continues...]
```

### 6.3 Correction and Clarification Flow

```
User: [Sends receipt]

AI: I found a receipt from Indomaret for Rp 45,500 on 14 Jan 2026.

Is this information correct?

---

User: No, the amount is wrong

---

AI: I apologize for the error. What is the correct amount?

---

User: It should be 54,500

---

AI: Thank you for the correction. Updated amount to Rp 54,500.

Let me confirm all details:
• Merchant: Indomaret
• Amount: Rp 54,500 (corrected)
• Date: 14 Jan 2026

Is everything correct now?
1. Yes, continue
2. No, more corrections needed

---

User: Wait, the date should be 15 Jan

---

AI: Understood. Date updated to 15 Jan 2026.

Final confirmation:
• Merchant: Indomaret
• Amount: Rp 54,500
• Date: 15 Jan 2026

Everything correct?
1. Yes, proceed
2. No, let me correct again

---

User: Yes

---

[Continues to claim type selection...]
```

### 6.4 Multilingual Handling

**Language Detection:**
```javascript
// n8n Function Node - Detect Language
const detectLanguage = (text) => {
  const indonesianPatterns = [
    /\b(saya|kami|yang|untuk|dengan|adalah|ini|itu)\b/i,
    /\b(halo|terima|kasih|maaf|tolong|mohon)\b/i
  ];
  
  const hasIndonesian = indonesianPatterns.some(pattern => pattern.test(text));
  return hasIndonesian ? 'id' : 'en';
};
```

**Response Selection:**
```javascript
// n8n Function Node - Get Response
const getResponse = (templateKey, language, variables = {}) => {
  let template = RESPONSE_TEMPLATES[templateKey][language];
  
  // Replace variables
  Object.entries(variables).forEach(([key, value]) => {
    template = template.replace(`{${key}}`, value);
  });
  
  return template;
};
```

**Example Bilingual Templates:**
```typescript
const TEMPLATES = {
  welcome: {
    id: 'Halo! 👋 Saya asisten klaim perjalanan Anda. Kirim gambar struk dan saya akan membantu submit klaim.',
    en: 'Hi! 👋 I\'m your travel claim assistant. Send me a receipt image and I\'ll help you submit your claim.'
  },
  
  receiptReceived: {
    id: 'Terima kasih! Sedang menganalisis struk Anda...',
    en: 'Thank you! Analyzing your receipt...'
  },
  
  success: {
    id: '✅ Klaim berhasil disubmit!\n\n📋 ID Klaim: {claimId}\n💰 Jumlah: Rp {amount}\n\nManager akan mereview segera.',
    en: '✅ Claim submitted successfully!\n\n📋 Claim ID: {claimId}\n💰 Amount: Rp {amount}\n\nYour manager will review it shortly.'
  },
  
  error: {
    id: '❌ Maaf, terjadi kesalahan: {error}\n\nSilakan coba lagi atau hubungi admin.',
    en: '❌ Sorry, an error occurred: {error}\n\nPlease try again or contact admin.'
  }
};
```

---

## 7. Integration with Main System

### 7.1 API Endpoints

#### Endpoint 1: Get Approved Travel Requests

**Route:** `GET /api/webhooks/n8n/travel-requests`  
**Purpose:** Retrieve user's approved travel requests for claim submission

**Request:**
```typescript
interface GetTravelRequestsRequest {
  employeeId?: string;      // Optional: filter by employee ID
  phoneNumber?: string;     // Alternative: lookup by phone number
  status?: TravelStatus[];  // Filter by status (default: LOCKED, APPROVED_*)
}
```

**Response:**
```typescript
interface GetTravelRequestsResponse {
  success: boolean;
  data: Array<{
    id: string;
    requestNumber: string;
    destination: string;
    purpose: string;
    startDate: string;      // ISO 8601
    endDate: string;        // ISO 8601
    status: TravelStatus;
    estimatedBudget?: number;
  }>;
  error?: string;
}
```

**Authentication:** Bearer token (shared secret between n8n and system)

**Implementation Reference:**
```typescript
// Handler in Next.js API route
// See API_DESIGN.md for tRPC implementation
export async function GET(req: Request) {
  // 1. Verify webhook authentication
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (token !== process.env.N8N_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // 2. Extract query parameters
  const { searchParams } = new URL(req.url);
  const phoneNumber = searchParams.get('phoneNumber');
  
  if (!phoneNumber) {
    return Response.json({ error: 'Phone number required' }, { status: 400 });
  }
  
  // 3. Find user by phone number
  const user = await db.user.findFirst({
    where: { phoneNumber, deletedAt: null }
  });
  
  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }
  
  // 4. Get approved travel requests
  const travelRequests = await db.travelRequest.findMany({
    where: {
      requesterId: user.id,
      status: {
        in: ['LOCKED', 'APPROVED_L1', 'APPROVED_L2', 'APPROVED_L3']
      },
      deletedAt: null
    },
    select: {
      id: true,
      requestNumber: true,
      destination: true,
      purpose: true,
      startDate: true,
      endDate: true,
      status: true,
      estimatedBudget: true
    },
    orderBy: { startDate: 'desc' },
    take: 10
  });
  
  return Response.json({ success: true, data: travelRequests });
}
```

#### Endpoint 2: Submit Claim

**Route:** `POST /api/webhooks/n8n/claims`  
**Purpose:** Submit a new claim from WhatsApp

**Request:**
```typescript
interface SubmitClaimRequest {
  // User identification
  phoneNumber: string;
  
  // Travel request link
  travelRequestId: string;
  
  // Claim type
  claimType: 'ENTERTAINMENT' | 'NON_ENTERTAINMENT';
  
  // Entertainment fields (if claimType === 'ENTERTAINMENT')
  entertainmentType?: 'MEAL' | 'GIFT' | 'EVENT' | 'HOSPITALITY' | 'OTHER';
  entertainmentDate?: string;      // ISO 8601
  entertainmentLocation?: string;
  entertainmentAddress?: string;
  guestName?: string;
  guestCompany?: string;
  guestPosition?: string;
  isGovernmentOfficial?: boolean;
  
  // Non-entertainment fields (if claimType === 'NON_ENTERTAINMENT')
  expenseCategory?: 'TRANSPORT' | 'PHONE_BILLING' | 'TRAVEL_EXPENSES' | 
                    'OVERTIME_MEALS' | 'BPJS_HEALTH' | 'EQUIPMENT_STATIONERY' | 
                    'MOTORCYCLE_SERVICE' | 'ACCOMMODATION' | 'OTHER';
  expenseDate?: string;            // ISO 8601
  expenseDestination?: string;
  customerName?: string;
  
  // Common fields
  amount: number;
  description: string;
  notes?: string;
  
  // Attachment
  attachmentUrl?: string;          // Temporary URL to receipt image
  attachmentMimeType?: string;
  attachmentFilename?: string;
  
  // Metadata
  extractedData?: any;             // Original OCR/extraction data for audit
  submittedVia: 'whatsapp';
}
```

**Response:**
```typescript
interface SubmitClaimResponse {
  success: boolean;
  data?: {
    claimId: string;
    claimNumber: string;
    status: ClaimStatus;
    amount: number;
  };
  error?: string;
  validationErrors?: Array<{
    field: string;
    message: string;
  }>;
}
```

**Implementation:**
```typescript
export async function POST(req: Request) {
  // 1. Verify authentication
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (token !== process.env.N8N_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // 2. Parse and validate request
  const body = await req.json();
  const validation = validateClaimRequest(body);
  if (!validation.valid) {
    return Response.json({ 
      error: 'Validation failed', 
      validationErrors: validation.errors 
    }, { status: 400 });
  }
  
  // 3. Find user
  const user = await db.user.findFirst({
    where: { phoneNumber: body.phoneNumber, deletedAt: null }
  });
  
  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }
  
  // 4. Verify travel request access
  const travelRequest = await db.travelRequest.findFirst({
    where: {
      id: body.travelRequestId,
      OR: [
        { requesterId: user.id },
        { participants: { some: { userId: user.id } } }
      ]
    }
  });
  
  if (!travelRequest) {
    return Response.json({ error: 'Travel request not found or not authorized' }, { status: 403 });
  }
  
  // 5. Create claim
  const claimNumber = await generateClaimNumber();
  
  const claim = await db.claim.create({
    data: {
      claimNumber,
      travelRequestId: body.travelRequestId,
      submitterId: user.id,
      claimType: body.claimType,
      status: 'DRAFT',
      
      // Type-specific fields
      entertainmentType: body.entertainmentType,
      entertainmentDate: body.entertainmentDate,
      entertainmentLocation: body.entertainmentLocation,
      guestName: body.guestName,
      guestCompany: body.guestCompany,
      
      expenseCategory: body.expenseCategory,
      expenseDate: body.expenseDate,
      expenseDestination: body.expenseDestination,
      customerName: body.customerName,
      
      // Common fields
      amount: body.amount,
      description: body.description,
      notes: body.notes,
      submittedVia: 'whatsapp'
    }
  });
  
  // 6. Handle attachment if provided
  if (body.attachmentUrl) {
    await handleAttachmentUpload(claim.id, body.attachmentUrl, {
      mimeType: body.attachmentMimeType,
      filename: body.attachmentFilename
    });
  }
  
  // 7. Auto-submit if all required fields present
  if (validation.complete) {
    await submitClaimForApproval(claim.id);
  }
  
  return Response.json({
    success: true,
    data: {
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      status: claim.status,
      amount: claim.amount.toNumber()
    }
  });
}
```

#### Endpoint 3: Upload Attachment

**Flow:** Use existing attachment upload flow from [`API_DESIGN.md`](API_DESIGN.md:1206)

**Steps:**
1. n8n downloads media from WhatsApp URL
2. n8n calls `POST /api/trpc/attachment.getUploadUrl` with claim ID
3. System returns presigned upload URL
4. n8n uploads file to presigned URL
5. n8n calls `POST /api/trpc/attachment.confirmUpload` to confirm
6. System creates attachment record

**n8n Workflow Nodes:**
```javascript
// Node 1: Get Upload URL
{
  "url": "{{$env.NEXTJS_API_URL}}/api/trpc/attachment.getUploadUrl",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{$env.N8N_API_SECRET}}",
    "Content-Type": "application/json"
  },
  "body": {
    "claimId": "={{$json.claimId}}",
    "filename": "={{$json.media.filename}}",
    "mimeType": "={{$json.media.mimeType}}",
    "fileSize": "={{$json.media.fileSize}}"
  }
}

// Node 2: Upload to Presigned URL
{
  "url": "={{$json.uploadUrl}}",
  "method": "PUT",
  "headers": {
    "Content-Type": "={{$json.mimeType}}"
  },
  "body": "={{$binary.data}}"
}

// Node 3: Confirm Upload
{
  "url": "{{$env.NEXTJS_API_URL}}/api/trpc/attachment.confirmUpload",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{$env.N8N_API_SECRET}}",
    "Content-Type": "application/json"
  },
  "body": {
    "claimId": "={{$json.claimId}}",
    "uploadKey": "={{$json.uploadKey}}",
    "filename": "={{$json.filename}}",
    "originalName": "={{$json.media.filename}}",
    "mimeType": "={{$json.mimeType}}",
    "fileSize": "={{$json.fileSize}}",
    "storageUrl": "={{$json.storageUrl}}"
  }
}
```

### 7.2 Authentication and Authorization

#### n8n → System Authentication

**Method:** Shared secret token (Bearer token)

**Configuration:**
```bash
# System .env
N8N_WEBHOOK_SECRET=your_secure_random_token_here

# n8n environment
NEXTJS_API_URL=https://yourdomain.com
N8N_API_SECRET=your_secure_random_token_here
```

**Verification in System:**
```typescript
// Middleware for webhook endpoints
export function verifyN8nWebhook(req: Request): boolean {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  return token === process.env.N8N_WEBHOOK_SECRET;
}
```

#### Phone Number → User Mapping

**Flow:**
1. n8n receives WhatsApp message with phone number
2. n8n calls system API with phone number
3. System looks up user by [`phoneNumber`](travel-claim/prisma/schema.prisma:178) field
4. System returns user details or error if not found

**User Registration:**
- Users must register phone number in system profile
- Phone format: E.164 format (e.g., "+6281234567890")
- Verification: Optional SMS/WhatsApp verification code

**Implementation:**
```typescript
// User lookup by phone
const user = await db.user.findFirst({
  where: {
    phoneNumber: normalizePhoneNumber(phoneNumber),
    deletedAt: null
  },
  select: {
    id: true,
    name: true,
    email: true,
    employeeId: true,
    role: true,
    departmentId: true
  }
});

// Phone normalization
function normalizePhoneNumber(phone: string): string {
  // Remove spaces, dashes, parentheses
  phone = phone.replace(/[\s\-\(\)]/g, '');
  
  // Add + if missing
  if (!phone.startsWith('+')) {
    phone = '+' + phone;
  }
  
  return phone;
}
```

---

## 8. State Management

### 8.1 WhatsAppSession Model (Future Schema Change)

```prisma
model WhatsAppSession {
  id              String    @id @default(cuid())
  sessionId       String    @unique // Phone number or custom session ID
  
  userId          String?
  user            User?     @relation(fields: [userId], references: [id])
  
  phoneNumber     String    @db.VarChar(20)
  isActive        Boolean   @default(true)
  language        String    @db.VarChar(5) @default("id") // "id" or "en"
  
  // Conversation state
  currentState    String    @db.VarChar(50) // ConversationState enum
  
  // Session context (JSON)
  context         Json?     // Stores extractedData, selections, etc.
  
  // Expiry
  lastActivityAt  DateTime  @default(now())
  expiresAt       DateTime  // 24 hours from last activity
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  // Relations
  messages        WhatsAppMessage[]
  
  @@index([phoneNumber, isActive])
  @@index([userId])
  @@index([expiresAt])
}

model WhatsAppMessage {
  id              String          @id @default(cuid())
  sessionId       String
  session         WhatsAppSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  
  messageId       String          @unique // WhatsApp message ID
  
  role            String          @db.VarChar(20) // "user" or "assistant"
  contentType     String          @db.VarChar(20) // "text", "image", "function_call"
  content         String          @db.Text
  
  // Media reference
  mediaUrl        String?         @db.Text
  mediaMimeType   String?         @db.VarChar(100)
  
  // Function call data
  functionName    String?         @db.VarChar(100)
  functionArgs    Json?
  
  createdAt       DateTime        @default(now())
  
  @@index([sessionId, createdAt])
  @@index([messageId])
}
```

### 8.2 Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: User sends first message
    Created --> Active: Session initialized
    Active --> Active: User activity
    Active --> Idle: No activity for 10 min
    Idle --> Active: User resumes
    Idle --> Expired: No activity for 24h
    Active --> Completed: Claim submitted
    Completed --> Expired: 24h after completion
    Expired --> [*]
```

**Session Expiry Rules:**
- **Idle timeout:** 10 minutes (show warning)
- **Hard expiry:** 24 hours from last activity
- **Completed expiry:** 24 hours after successful claim submission
- **Max messages:** 100 messages per session (then force new session)

### 8.3 Session Operations in n8n

```javascript
// Load or Create Session
const getSession = async (phoneNumber) => {
  // Try to load active session
  let session = await db.whatsAppSession.findFirst({
    where: {
      phoneNumber,
      isActive: true,
      expiresAt: { gt: new Date() }
    },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  });
  
  // Create new session if none exists
  if (!session) {
    session = await db.whatsAppSession.create({
      data: {
        sessionId: phoneNumber,
        phoneNumber,
        currentState: 'idle',
        context: {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        messages: []
      }
    });
  }
  
  return session;
};

// Update Session State
const updateSession = async (sessionId, updates) => {
  await db.whatsAppSession.update({
    where: { id: sessionId },
    data: {
      ...updates,
      lastActivityAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      updatedAt: new Date()
    }
  });
};

// Add Message to Session
const addMessage = async (sessionId, role, content, metadata = {}) => {
  await db.whatsAppMessage.create({
    data: {
      sessionId,
      messageId: metadata.messageId || `msg_${Date.now()}`,
      role,
      contentType: metadata.contentType || 'text',
      content,
      mediaUrl: metadata.mediaUrl,
      mediaMimeType: metadata.mediaMimeType
    }
  });
};

// Expire Session
const expireSession = async (sessionId) => {
  await db.whatsAppSession.update({
    where: { id: sessionId },
    data: {
      isActive: false,
      currentState: 'expired'
    }
  });
};
```

### 8.4 Context Storage Strategy

**Storage:** JSON field in WhatsAppSession.context

**Structure:**
```typescript
interface SessionContext {
  // Current state
  state: ConversationState;
  
  // Extracted data
  extractedData?: ExtractedReceiptData;
  
  // User selections
  claimType?: 'ENTERTAINMENT' | 'NON_ENTERTAINMENT';
  selectedTravelRequestId?: string;
  selectedTravelRequestNumber?: string;
  
  // Collected fields
  entertainmentFields?: {
    type?: string;
    date?: string;
    location?: string;
    guestName?: string;
    guestCompany?: string;
    guestPosition?: string;
    isGovernment?: boolean;
  };
  
  nonEntertainmentFields?: {
    category?: string;
    date?: string;
    destination?: string;
    customerName?: string;
  };
  
  // Common fields
  amount?: number;
  description?: string;
  notes?: string;
  
  // Media references
  receiptMediaUrl?: string;
  receiptStorageUrl?: string;
  
  // Workflow tracking
  missingFields?: string[];
  validationErrors?: string[];
  retryCount?: number;
  
  // Metadata
  startedAt?: number;
  lastStateChangeAt?: number;
}
```

---

## 9. Security and Compliance

### 9.1 Webhook Security

#### HMAC Signature Verification

**Implementation in n8n:**
```javascript
// n8n Function Node - Verify Signature
const crypto = require('crypto');

const verifySignature = (payload, signature, secret) => {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

// Verify incoming webhook
const isValid = verifySignature(
  {
    messageId: $json.messageId,
    timestamp: $json.timestamp,
    from: $json.from,
    type: $json.type,
    text: $json.text,
    media: $json.media
  },
  $json.signature,
  $env.WHATSAPP_WEBHOOK_SECRET
);

if (!isValid) {
  throw new Error('Invalid webhook signature');
}
```

#### IP Allowlist (Optional)

```javascript
// n8n Function Node - IP Validation
const ALLOWED_IPS = $env.WHATSAPP_INSTANCE_IPS.split(',');
const requestIP = $execution.customData.httpRequest.headers['x-forwarded-for'] || 
                  $execution.customData.httpRequest.connection.remoteAddress;

if (!ALLOWED_IPS.includes(requestIP)) {
  throw new Error(`Unauthorized IP: ${requestIP}`);
}
```

### 9.2 Rate Limiting

**Implementation:**
```javascript
// n8n Redis Rate Limiter
const redis = require('redis');
const client = redis.createClient({ url: $env.REDIS_URL });

// Per-user rate limit: 10 messages per minute
const key = `rate_limit:user:${$json.from}`;
const count = await client.incr(key);

if (count === 1) {
  await client.expire(key, 60); // 1 minute window
}

if (count > 10) {
  return {
    status: 429,
    response: 'You are sending messages too quickly. Please wait a moment.'
  };
}

// Global rate limit: 40 messages per second (80% of 50 msg/sec limit)
const globalKey = 'rate_limit:global';
const globalCount = await client.incr(globalKey);

if (globalCount === 1) {
  await client.expire(globalKey, 1); // 1 second window
}

if (globalCount > 40) {
  return {
    status: 429,
    response: 'System is busy. Please try again in a moment.'
  };
}
```

### 9.3 Data Privacy and PII Handling

**PII Data:**
- Phone numbers
- User names
- Receipt images (may contain personal information)
- Guest information (for entertainment claims)

**Protection Measures:**

1. **Encryption at Rest:**
   - Database encryption (PostgreSQL)
   - Receipt images stored in encrypted storage (R2 with encryption)

2. **Encryption in Transit:**
   - HTTPS for all API calls
   - TLS 1.3 for database connections

3. **Data Retention:**
   - Session data: 30 days after expiry
   - Message history: 90 days
   - Receipt images: Retained per company policy (typically 7 years for tax purposes)

4. **Access Control:**
   - Only authorized system can access n8n webhooks
   - Only claim owner and approvers can view receipt images
   - Audit log for all receipt image access

5. **Data Minimization:**
   - Only store necessary conversation history
   - Truncate old messages beyond 100 per session
   - Remove temporary media files after upload

### 9.4 Audit Logging

**Events to Log:**
```typescript
interface AuditEvent {
  timestamp: number;
  eventType: 'webhook_received' | 'session_created' | 'receipt_analyzed' | 
             'claim_submitted' | 'error_occurred' | 'session_expired';
  userId?: string;
  phoneNumber: string;
  sessionId: string;
  
  details: {
    messageId?: string;
    claimId?: string;
    errorMessage?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  
  metadata?: Record<string, any>;
}
```

**Implementation:**
```javascript
// n8n Audit Log Node
const logEvent = async (event) => {
  await fetch(`${$env.NEXTJS_API_URL}/api/webhooks/n8n/audit-log`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${$env.N8N_API_SECRET}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      timestamp: Date.now(),
      eventType: event.type,
      phoneNumber: $json.from,
      sessionId: $json.sessionId,
      details: event.details
    })
  });
};
```

### 9.5 Compliance Checklist

**Security:**
- [x] HMAC signature verification on webhooks
- [x] Bearer token authentication for API calls
- [x] Rate limiting (per-user and global)
- [x] IP allowlist (optional)
- [x] Input validation and sanitization
- [x] SQL injection prevention (Prisma parameterized queries)
- [x] XSS prevention (React auto-escaping)

**Privacy:**
- [x] Encryption at rest (database and files)
- [x] Encryption in transit (HTTPS/TLS)
- [x] Data minimization
- [x] User consent for WhatsApp integration
- [x] Access control (RBAC)
- [x] Audit logging

**Compliance:**
- [x] GDPR compliance (data export, deletion, consent)
- [x] Data retention policies
- [x] Audit trail for financial records
- [x] Secure file handling
- [x] Error handling without exposing sensitive data

---

## 10. Deployment Strategy

### 10.1 Hosting Recommendations

**Option 1: VPS with Docker (Recommended)**
- **Provider:** DigitalOcean, Linode, Vultr, or Hetzner
- **Specs:** 4 vCPU, 8GB RAM, 160GB SSD
- **Cost:** $40-60/month

**Option 2: Cloud Platform**
- **Provider:** AWS, Google Cloud, or Azure
- **Services:** EC2/Compute Engine + RDS/Cloud SQL
- **Cost:** $80-150/month (with reserved instances)

**n8n Deployment:**
- Docker container on same VPS as Next.js app
- Or separate VPS for better isolation
- Or n8n Cloud ($20-50/month)

### 10.2 Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  nextjs:
    build: ./travel-claim
    container_name: travel-claim-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres:5432/travelclaim
      - REDIS_URL=redis://redis:6379
      - N8N_WEBHOOK_SECRET=${N8N_WEBHOOK_SECRET}
    depends_on:
      - postgres
      - redis
    networks:
      - app-network

  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_USERNAME}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
      - N8N_HOST=${N8N_HOST}
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=${N8N_WEBHOOK_URL}
      - GENERIC_TIMEZONE=Asia/Makassar
      # Database for n8n workflows
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=postgres
      - DB_POSTGRESDB_PASSWORD=${DB_PASSWORD}
      # Custom environment variables
      - WHATSAPP_WEBHOOK_SECRET=${WHATSAPP_WEBHOOK_SECRET}
      - WHATSAPP_API_URL=${WHATSAPP_API_URL}
      - WHATSAPP_API_KEY=${WHATSAPP_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - NEXTJS_API_URL=http://nextjs:3000
      - N8N_API_SECRET=${N8N_WEBHOOK_SECRET}
    volumes:
      - n8n-data:/home/node/.n8n
    depends_on:
      - postgres
    networks:
      - app-network

  postgres:
    image: postgres:16-alpine
    container_name: postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_MULTIPLE_DATABASES=travelclaim,n8n
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-multiple-databases.sh:/docker-entrypoint-initdb.d/init-multiple-databases.sh
    networks:
      - app-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    container_name: nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - nextjs
      - n8n
    networks:
      - app-network

volumes:
  postgres-data:
  redis-data:
  n8n-data:

networks:
  app-network:
    driver: bridge
```

### 10.3 Scaling Considerations

**Current Architecture:** Single VPS (suitable for <1000 users)

**Scaling Triggers:**
- CPU usage >70% sustained
- Memory usage >80%
- Response time >500ms p95
- More than 500 concurrent WhatsApp conversations

**Vertical Scaling:**
- Upgrade VPS to 8 vCPU, 16GB RAM
- Add SSD storage as needed

**Horizontal Scaling (Future):**
```
Load Balancer
├── Next.js Instance 1
├── Next.js Instance 2
└── Next.js Instance 3

n8n Cluster
├── n8n Instance 1 (with Redis queue)
├── n8n Instance 2
└── n8n Instance 3

PostgreSQL Primary + Read Replicas
Redis Cluster
Shared File Storage (R2)
```

### 10.4 Monitoring and Alerting

**Metrics to Monitor:**
```yaml
Infrastructure:
  - CPU usage
  - Memory usage
  - Disk usage
  - Network I/O

Application:
  - Response time (p50, p95, p99)
  - Error rate
  - Request rate
  - Active sessions

Business:
  - Claims submitted per hour
  - Average conversation duration
  - OCR success rate
  - Claim submission success rate
```

**Tools:**
- **Metrics:** Prometheus + Grafana
- **Logs:** Loki or ELK stack
- **Uptime:** UptimeRobot or Pingdom
- **Errors:** Sentry (optional)

**Alert Conditions:**
```yaml
Critical:
  - Service down for >2 minutes
  - Error rate >5%
  - Response time >2s p95
  - Disk usage >90%

Warning:
  - CPU usage >70% for 5 minutes
  - Memory usage >80%
  - OCR failure rate >10%
  - No claims submitted in 1 hour (during business hours)
```

### 10.5 Cost Estimation

**Monthly Costs:**

```
Infrastructure:
├── VPS (4 vCPU, 8GB RAM)          : $50
├── Domain + SSL                   : $2
├── Backups                        : $10
└── Monitoring (optional)          : $0-20

External Services:
├── OpenAI API                     : $50-200 (usage-based)
│   ├── GPT-4 Vision: $0.01/image
│   └── GPT-4o Text: $0.03/1K tokens
├── File Storage (R2)              : $5-15
└── Email (Resend)                 : $20

Total Estimated: $137-297/month

Usage Assumptions:
- 100 claims/day via WhatsApp
- Average 5 messages per conversation
- Average 2 receipt images per claim
- 50GB file storage

Cost Breakdown by Usage:
- OpenAI: 100 claims × 30 days × $0.015 = $45-150/month
- Storage: 50GB × $0.15/GB = $7.50/month
- Email: 500 emails/day × 30 = $20/month
```

**Cost Optimization:**
- Use GPT-4o instead of GPT-4 Vision (cheaper)
- Cache common AI responses
- Compress images before sending to API
- Use batch processing where possible
- Consider self-hosted OCR (Tesseract) as fallback

---

## 11. n8n Workflow Design

### 11.1 Workflow Overview

```mermaid
graph TB
    Start[Webhook Trigger] --> Verify[Verify HMAC Signature]
    Verify -->|Invalid| Reject[Return 401]
    Verify -->|Valid| LoadSession[Load or Create Session]
    
    LoadSession --> CheckType{Message Type}
    
    CheckType -->|Image| DownloadMedia[Download Media]
    CheckType -->|Text| ProcessText[Process Text Input]
    
    DownloadMedia --> Preprocess[Preprocess Image]
    Preprocess --> CallAI[Call GPT-4 Vision]
    
    CallAI --> ExtractData[Extract Receipt Data]
    ExtractData --> CalculateConf[Calculate Confidence]
    
    CalculateConf -->|High| ConfirmData[Ask User to Confirm]
    CalculateConf -->|Low| ManualEntry[Request Manual Entry]
    
    ProcessText --> ParseIntent[Parse User Intent]
    ParseIntent --> StateRouter{Current State}
    
    StateRouter -->|Validation| HandleValidation[Handle Validation Response]
    StateRouter -->|ClaimType| HandleClaimType[Handle Claim Type Selection]
    StateRouter -->|TravelSelect| HandleTravelSelect[Handle Travel Selection]
    StateRouter -->|FieldCollection| HandleFieldCollection[Handle Field Input]
    StateRouter -->|Confirmation| HandleConfirmation[Handle Final Confirmation]
    
    HandleValidation --> UpdateSession1[Update Session]
    HandleClaimType --> FetchTravel[Fetch Travel Requests]
    HandleTravelSelect --> UpdateSession2[Update Session]
    HandleFieldCollection --> CheckComplete{All Fields?}
    HandleConfirmation --> SubmitClaim[Submit Claim to System]
    
    FetchTravel --> SendTravelList[Send Travel Options]
    CheckComplete -->|No| AskNextField[Ask Next Field]
    CheckComplete -->|Yes| ShowSummary[Show Summary]
    
    SubmitClaim -->|Success| SendSuccess[Send Success Message]
    SubmitClaim -->|Error| SendError[Send Error Message]
    
    ConfirmData --> SendResponse1[Send WhatsApp Message]
    ManualEntry --> SendResponse1
    SendTravelList --> SendResponse1
    AskNextField --> SendResponse1
    ShowSummary --> SendResponse1
    SendSuccess --> SendResponse1
    SendError --> SendResponse1
    
    SendResponse1 --> UpdateSession3[Update Session State]
    UpdateSession3 --> LogAudit[Log Audit Event]
    LogAudit --> End[Return 200 OK]
    
    UpdateSession1 --> SendResponse1
    UpdateSession2 --> SendResponse1
```

### 11.2 Main Workflow Nodes

**Node 1: Webhook Trigger**
```json
{
  "name": "WhatsApp Webhook",
  "type": "n8n-nodes-base.webhook",
  "parameters": {
    "path": "whatsapp-claim",
    "responseMode": "lastNode",
    "options": {}
  }
}
```

**Node 2: HMAC Verification**
```json
{
  "name": "Verify Signature",
  "type": "n8n-nodes-base.function",
  "parameters": {
    "functionCode": "const crypto = require('crypto');\n\nconst payload = {\n  messageId: $json.messageId,\n  timestamp: $json.timestamp,\n  from: $json.from,\n  type: $json.type,\n  text: $json.text,\n  media: $json.media\n};\n\nconst expected = crypto.createHmac('sha256', $env.WHATSAPP_WEBHOOK_SECRET)\n  .update(JSON.stringify(payload))\n  .digest('hex');\n\nif (expected !== $json.signature) {\n  throw new Error('Invalid signature');\n}\n\nreturn { verified: true, ...payload };"
  }
}
```

**Node 3: Load Session**
```json
{
  "name": "Load Session",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT * FROM \"WhatsAppSession\" WHERE \"phoneNumber\" = '{{$json.from}}' AND \"isActive\" = true AND \"expiresAt\" > NOW() LIMIT 1",
    "options": {}
  }
}
```

**Node 4: Download Media**
```json
{
  "name": "Download Receipt",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "url": "={{$json.media.url}}",
    "method": "GET",
    "responseFormat": "file",
    "options": {
      "timeout": 30000
    }
  }
}
```

**Node 5: Call GPT-4 Vision**
```json
{
  "name": "Analyze Receipt",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "url": "https://api.openai.com/v1/chat/completions",
    "method": "POST",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "Authorization",
          "value": "Bearer {{$env.OPENAI_API_KEY}}"
        }
      ]
    },
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "model",
          "value": "gpt-4-vision-preview"
        },
        {
          "name": "messages",
          "value": "={{JSON.stringify([{role: 'system', content: $node['Prompts'].json.systemPrompt}, {role: 'user', content: [{type: 'text', text: 'Extract receipt data'}, {type: 'image_url', image_url: {url: $json.mediaUrl, detail: 'high'}}]}])}}"
        },
        {
          "name": "functions",
          "value": "={{JSON.stringify([$node['Prompts'].json.extractFunction])}}"
        },
        {
          "name": "function_call",
          "value": "={\"name\": \"extract_receipt_data\"}"
        }
      ]
    }
  }
}
```

**Node 6: Send WhatsApp Message**
```json
{
  "name": "Send Reply",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "url": "={{$env.WHATSAPP_API_URL}}/api/send",
    "method": "POST",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "Authorization",
          "value": "Bearer {{$env.WHATSAPP_API_KEY}}"
        }
      ]
    },
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "to",
          "value": "={{$json.from}}"
        },
        {
          "name": "type",
          "value": "text"
        },
        {
          "name": "text",
          "value": "={{$json.responseMessage}}"
        }
      ]
    }
  }
}
```

### 11.3 Error Handling Nodes

**Global Error Catcher:**
```json
{
  "name": "Error Handler",
  "type": "n8n-nodes-base.function",
  "parameters": {
    "functionCode": "const error = $input.item.json.error || $input.item.json;\n\nconsole.error('Workflow error:', error);\n\nconst errorMessage = {\n  id: `Maaf, terjadi kesalahan: ${error.message}\\n\\nSilakan coba lagi atau hubungi admin.`,\n  en: `Sorry, an error occurred: ${error.message}\\n\\nPlease try again or contact admin.`\n};\n\nconst lang = $node['Load Session'].json.language || 'id';\n\nreturn {\n  from: $node['WhatsApp Webhook'].json.from,\n  responseMessage: errorMessage[lang],\n  error: error.message,\n  stack: error.stack\n};"
  },
  "continueOnFail": true
}
```

### 11.4 Workflow Variables and Settings

**Environment Variables:**
```bash
# WhatsApp Instance
WHATSAPP_WEBHOOK_SECRET=your_hmac_secret
WHATSAPP_API_URL=https://whatsapp-instance.example.com
WHATSAPP_API_KEY=your_api_key

# OpenAI
OPENAI_API_KEY=sk-...

# System Integration
NEXTJS_API_URL=http://nextjs:3000
N8N_API_SECRET=your_webhook_secret

# Database (n8n uses for workflow storage)
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=postgres
DB_POSTGRESDB_DATABASE=n8n
```

**Workflow Settings:**
```json
{
  "settings": {
    "executionTimeout": 300,
    "saveExecutionProgress": true,
    "saveManualExecutions": true,
    "saveDataErrorExecution": "all",
    "saveDataSuccessExecution": "all",
    "timezone": "Asia/Makassar"
  }
}
```

---

## 12. Testing Strategy

### 12.1 Unit Testing

**Test Categories:**
1. Data extraction logic
2. Validation rules
3. Confidence calculation
4. State transitions
5. Error handling

**Example Tests:**
```typescript
describe('Receipt Data Extraction', () => {
  it('should extract amount from clear receipt', async () => {
    const mockImage = loadTestImage('clear_receipt.jpg');
    const result = await extractReceiptData(mockImage);
    
    expect(result.amount).toBe(250000);
    expect(result.confidence).toBeGreaterThan(0.9);
  });
  
  it('should handle blurry receipt with low confidence', async () => {
    const mockImage = loadTestImage('blurry_receipt.jpg');
    const result = await extractReceiptData(mockImage);
    
    expect(result.confidence).toBeLessThan(0.7);
    expect(result.uncertainFields).toContain('amount');
  });
});

describe('Validation Rules', () => {
  it('should reject amount outside valid range', () => {
    const result = validateAmount(150000000); // 150 million
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum');
  });
  
  it('should accept valid amount', () => {
    const result = validateAmount(250000);
    expect(result.valid).toBe(true);
  });
});
```

### 12.2 Integration Testing

**Test Scenarios:**
1. Complete claim submission flow
2. Travel request lookup
3. Attachment upload
4. API authentication
5. Error recovery

**Example Tests:**
```typescript
describe('Claim Submission Flow', () => {
  it('should submit entertainment claim successfully', async () => {
    // 1. Mock user session
    const session = await createTestSession('+6281234567890');
    
    // 2. Mock receipt upload
    const receiptData = {
      amount: 350000,
      date: '2026-01-15',
      merchant: 'Restaurant ABC'
    };
    
    // 3. Simulate conversation
    await simulateMessage(session, 'image', { receiptData });
    await simulateMessage(session, 'text', 'Yes correct');
    await simulateMessage(session, 'text', '1'); // Entertainment
    await simulateMessage(session, 'text', '1'); // Select trip
    await simulateMessage(session, 'text', 'Guest: John Doe, Company: PT XYZ');
    await simulateMessage(session, 'text', 'Yes submit');
    
    // 4. Verify claim created
    const claims = await db.claim.findMany({
      where: { submitterId: session.userId }
    });
    
    expect(claims).toHaveLength(1);
    expect(claims[0].amount).toBe(350000);
    expect(claims[0].status).toBe('SUBMITTED');
  });
});
```

### 12.3 End-to-End Testing

**Test Flows:**
1. **Happy Path:** Receipt → Extraction → Confirmation → Submission
2. **Manual Entry:** Blurry receipt → Manual data entry → Submission
3. **Corrections:** Extract → User corrects → Submission
4. **No Travel Requests:** User with no approved trips
5. **Error Recovery:** API failure → Retry → Success

**Testing Tools:**
- WhatsApp API simulators
- Mock OpenAI responses
- Test database with seed data
- Automated conversation scripts

### 12.4 Performance Testing

**Load Testing Scenarios:**
```yaml
Scenario 1: Normal Load
  - 10 concurrent users
  - 1 message per 10 seconds
  - Duration: 10 minutes
  - Expected: <500ms response time

Scenario 2: Peak Load
  - 50 concurrent users
  - 1 message per 5 seconds
  - Duration: 5 minutes
  - Expected: <1s response time

Scenario 3: Spike Test
  - Ramp from 10 to 100 users in 1 minute
  - Hold for 2 minutes
  - Ramp down to 10 users
  - Expected: No errors, graceful degradation
```

**Tools:** k6, Apache JMeter, or Locust

### 12.5 Mock Data

**Test Receipts:**
```
test-receipts/
├── clear_taxi_receipt.jpg       (High confidence)
├── restaurant_receipt.jpg        (Medium confidence)
├── blurry_receipt.jpg           (Low confidence)
├── non_english_receipt.jpg      (Indonesian text)
├── handwritten_receipt.jpg      (Very low confidence)
└── invalid_image.txt            (Error case)
```

**Test Users:**
```typescript
const TEST_USERS = [
  {
    phoneNumber: '+6281234567890',
    name: 'Test Employee',
    role: 'EMPLOYEE',
    hasApprovedTrips: true
  },
  {
    phoneNumber: '+6281234567891',
    name: 'Test Manager',
    role: 'MANAGER',
    hasApprovedTrips: true
  },
  {
    phoneNumber: '+6281234567892',
    name: 'New Employee',
    role: 'EMPLOYEE',
    hasApprovedTrips: false // Test no trips case
  }
];
```

---

## 13. User Guide

### 13.1 Getting Started

**Prerequisites:**
1. Employee must be registered in the system
2. Phone number must be added to user profile
3. Must have at least one approved travel request

**Initial Setup:**
1. Open WhatsApp on your phone
2. Save the company's WhatsApp AI Agent number: **+62 XXX XXXX XXXX**
3. Send a message: "Hello" or "Halo"
4. Agent will verify your phone number and guide you

### 13.2 Submitting a Claim

**Step-by-Step Guide:**

1. **Take a Photo of Receipt:**
   - Ensure receipt is well-lit and readable
   - Capture the entire receipt
   - Avoid shadows and glare

2. **Send to AI Agent:**
   - Open WhatsApp chat with AI Agent
   - Send the receipt image
   - Optionally add description: "Taxi to client meeting"

3. **Verify Extracted Data:**
   - Agent will show extracted information
   - Confirm if correct, or provide corrections
   - Example: "Yes correct" or "Amount is 250000"

4. **Select Claim Type:**
   - Choose Entertainment or Non-entertainment
   - Agent will ask for type-specific details

5. **Select Travel Request:**
   - Agent shows your approved trips
   - Reply with number (e.g., "1")

6. **Provide Additional Details:**
   - Answer agent's questions
   - Examples: Guest name, customer, expense category

7. **Confirm and Submit:**
   - Review summary
   - Confirm to submit
   - Receive claim ID

### 13.3 Example Conversations

**Example 1: Taxi Receipt (Indonesian)**
```
You: [Sends taxi receipt photo]

Agent: Terima kasih! Sedang menganalisis struk Anda...

Agent: Saya menemukan struk dari Blue Bird Taxi sebesar Rp 125,000 pada tanggal 15 Jan 2026.

Apakah informasi ini sudah benar?
1. Ya, lanjutkan
2. Tidak, ada yang salah

You: 1

Agent: Jenis pengeluaran apa ini?
1. 🍽️ Hiburan (makan/hadiah untuk tamu)
2. 🚗 Non-hiburan (transport/akomodasi/dll)

You: 2

Agent: Pilih perjalanan yang sesuai:
1. Perjalanan ke Jakarta (15-17 Jan)
2. Perjalanan ke Surabaya (20-22 Jan)

You: 1

Agent: Kategori pengeluaran?
1. 🚗 Transport
2. 🏨 Akomodasi
3. 📱 Tagihan telepon
4. 🍽️ Makan lembur
5. 📦 Lainnya

You: 1

Agent: Nama customer (jika ada)?

You: PT ABC Corp

Agent: Ringkasan klaim Anda:
• Jenis: Non-hiburan (Transport)
• Jumlah: Rp 125,000
• Tanggal: 15 Jan 2026
• Perjalanan: Jakarta (15-17 Jan)
• Customer: PT ABC Corp

Kirim klaim ini?
1. Ya, kirim
2. Tidak, batal

You: 1

Agent: ✅ Klaim berhasil disubmit!

📋 ID Klaim: CLM-202601-0156
💰 Jumlah: Rp 125,000

Manager Anda akan mereview segera. Terima kasih!
```

**Example 2: Restaurant Entertainment (English)**
```
You: [Sends restaurant receipt]

Agent: Thank you! Analyzing your receipt...

Agent: I found a receipt from Restaurant Padang for Rp 450,000 dated Jan 14, 2026.

Is this information correct?
1. Yes, continue
2. No, something's wrong

You: Yes

Agent: What type of expense is this?
1. 🍽️ Entertainment (meals/gifts for guests)
2. 🚗 Non-entertainment (transport/accommodation/etc)

You: 1

Agent: Which trip is this for?
1. Jakarta trip (Jan 15-17)
2. Surabaya trip (Jan 20-22)

You: 1

Agent: What type of entertainment?
1. 🍽️ Meal
2. 🎁 Gift
3. 🎉 Event
4. 🤝 Hospitality
5. 📦 Other

You: 1

Agent: Guest information:
Please provide:
- Guest name
- Company
- Position

You can send in one message like:
John Doe, PT XYZ, Director

You: Michael Chen, PT Digital Solutions, CEO

Agent: Is the guest a government official?
1. Yes
2. No

You: 2

Agent: Location of entertainment?

You: Restaurant Padang, Jakarta

Agent: Claim summary:
• Type: Entertainment (Meal)
• Amount: Rp 450,000
• Date: Jan 14, 2026
• Trip: Jakarta (Jan 15-17)
• Guest: Michael Chen, PT Digital Solutions, CEO
• Location: Restaurant Padang, Jakarta

Submit this claim?
1. Yes, submit
2. No, cancel

You: 1

Agent: ✅ Claim submitted successfully!

📋 Claim ID: CLM-202601-0157
💰 Amount: Rp 450,000

Your manager will review it shortly. Thank you!
```

### 13.4 Available Commands

**General Commands:**
- `help` - Show available commands
- `status` - Check claim status (coming soon)
- `cancel` - Cancel current conversation
- `restart` - Start new claim submission

**During Conversation:**
- `back` - Go back to previous step
- `correct [field]` - Correct specific information
- Example: "correct amount 250000"

### 13.5 Troubleshooting

**Issue: Image not readable**
```
Problem: "I can't read your receipt clearly"

Solutions:
1. Take photo in good lighting
2. Hold phone steady
3. Capture entire receipt
4. Try manual entry if needed
```

**Issue: Phone number not recognized**
```
Problem: "I don't recognize your phone number"

Solutions:
1. Verify phone registered in system
2. Contact HR/Admin to add phone
3. Check phone format (+62...)
```

**Issue: No approved travel requests**
```
Problem: "You don't have any approved trips"

Solutions:
1. Create travel request in system first
2. Wait for manager approval
3. Check with manager on status
```

**Issue: Submission failed**
```
Problem: "Failed to submit claim"

Solutions:
1. Try again in a few minutes
2. Check internet connection
3. Contact IT support if persists
4. Submit via web interface as backup
```

---

## 14. Summary and Next Steps

### 14.1 Design Deliverables

This design document provides:

✅ **Complete Architecture** - Components, data flows, deployment topology  
✅ **Integration Specifications** - WhatsApp webhook contracts, API endpoints  
✅ **AI Agent Design** - State machine, prompts, function calling  
✅ **OCR Pipeline** - Image preprocessing, extraction, validation  
✅ **Conversation Flows** - Complete user journeys with examples  
✅ **System Integration** - tRPC endpoints, authentication, file handling  
✅ **State Management** - Session persistence, context storage  
✅ **Security** - HMAC verification, rate limiting, audit logging  
✅ **Deployment** - Docker configuration, scaling strategy  
✅ **n8n Workflow** - Complete node diagram and configurations  
✅ **Testing Strategy** - Unit, integration, E2E test plans  
✅ **User Guide** - Setup instructions and troubleshooting

### 14.2 Implementation Roadmap

**Phase 1: Foundation (Week 1-2)**
- [ ] Set up n8n instance in Docker
- [ ] Configure WhatsApp webhook integration
- [ ] Implement HMAC signature verification
- [ ] Create basic webhook handler
- [ ] Set up session storage (database tables)

**Phase 2: AI Integration (Week 3-4)**
- [ ] Integrate OpenAI GPT-4 Vision API
- [ ] Implement receipt analysis workflow
- [ ] Build conversation state machine
- [ ] Create prompt templates (bilingual)
- [ ] Implement function calling for data extraction

**Phase 3: System Integration (Week 5-6)**
- [ ] Create webhook API endpoints in Next.js
- [ ] Implement travel request lookup endpoint
- [ ] Implement claim submission endpoint
- [ ] Integrate attachment upload flow
- [ ] Add authentication between n8n and system

**Phase 4: Conversation Flows (Week 7-8)**
- [ ] Build receipt upload flow
- [ ] Implement missing data collection flow
- [ ] Add correction and clarification handling
- [ ] Implement claim type selection
- [ ] Build final confirmation and submission

**Phase 5: Testing & Refinement (Week 9-10)**
- [ ] Unit testing (extraction, validation)
- [ ] Integration testing (API calls)
- [ ] End-to-end testing (full flows)
- [ ] User acceptance testing
- [ ] Performance testing
- [ ] Bug fixes and optimizations

**Phase 6: Deployment (Week 11-12)**
- [ ] Production deployment to VPS
- [ ] Configure SSL certificates
- [ ] Set up monitoring and alerts
- [ ] Create user documentation
- [ ] Train initial user group
- [ ] Gradual rollout to all users

### 14.3 Success Criteria

**Technical Metrics:**
- 95% uptime for WhatsApp integration
- <500ms average response time
- 90% OCR accuracy rate
- <5% claim submission error rate
- 100% HMAC signature verification

**Business Metrics:**
- 70% of claims submitted via WhatsApp within 3 months
- Average conversation time <5 minutes
- 80% user satisfaction rate
- 50% reduction in claim submission errors
- 30% faster claim approval cycle

**User Experience:**
- Simple and intuitive conversations
- Clear error messages
- Fast response times
- Reliable data extraction
- Seamless integration with existing system

### 14.4 Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OpenAI API downtime | High | Low | Fallback to manual entry, cache responses |
| WhatsApp rate limits | Medium | Medium | Queue management, user notification |
| Poor OCR accuracy | High | Medium | Manual entry fallback, user confirmation |
| Security breach | Critical | Low | HMAC verification, encryption, monitoring |
| Database performance | Medium | Low | Indexing, caching, query optimization |
| User adoption | High | Medium | Training, documentation, gradual rollout |

### 14.5 Future Enhancements

**Phase 2 Features:**
- Voice message support
- Group chat support for team claims
- Automated expense categorization
- Receipt duplicate detection
- Multi-currency support
- Claim status tracking via WhatsApp
- Approval actions via WhatsApp (for managers)
- Analytics dashboard for WhatsApp usage

**Advanced AI Features:**
- Fraud detection based on patterns
- Budget recommendations
- Smart expense categorization
- Predictive approval times
- Automated policy compliance checks

---

## Appendix A: Environment Variables Reference

```bash
# WhatsApp Instance Configuration
WHATSAPP_WEBHOOK_SECRET=your_hmac_secret_key_here
WHATSAPP_API_URL=https://whatsapp-instance.example.com
WHATSAPP_API_KEY=your_whatsapp_api_key_here
WHATSAPP_INSTANCE_IPS=192.168.1.1,192.168.1.2 # Optional IP allowlist

# OpenAI Configuration
OPENAI_API_KEY=sk-...your_openai_key_here
OPENAI_MODEL=gpt-4-vision-preview # or gpt-4o
OPENAI_MAX_TOKENS=1000
OPENAI_TEMPERATURE=0.1

# Next.js System Integration
NEXTJS_API_URL=http://nextjs:3000 # or https://yourdomain.com
N8N_API_SECRET=your_n8n_webhook_secret_here
N8N_WEBHOOK_SECRET=same_as_n8n_api_secret

# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:password@postgres:5432/travelclaim
DB_PASSWORD=your_secure_database_password

# Redis (Optional)
REDIS_URL=redis://redis:6379

# n8n Configuration
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your_n8n_admin_password
N8N_HOST=n8n.yourdomain.com
N8N_PROTOCOL=https
N8N_WEBHOOK_URL=https://n8n.yourdomain.com
GENERIC_TIMEZONE=Asia/Makassar

# n8n Database
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=postgres
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_USER=postgres
DB_POSTGRESDB_PASSWORD=your_db_password

# File Storage (Optional - R2)
R2_ENDPOINT=https://account_id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=travel-claims

# Monitoring (Optional)
SENTRY_DSN=https://your_sentry_dsn_here
```

---

## Appendix B: API Request/Response Examples

**Example: Get Travel Requests**
```bash
curl -X GET "https://yourdomain.com/api/webhooks/n8n/travel-requests?phoneNumber=%2B6281234567890" \
  -H "Authorization: Bearer your_webhook_secret"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "clx123abc",
      "requestNumber": "TR-202601-0045",
      "destination": "Jakarta",
      "purpose": "Client meeting with PT ABC",
      "startDate": "2026-01-15T00:00:00.000Z",
      "endDate": "2026-01-17T00:00:00.000Z",
      "status": "LOCKED",
      "estimatedBudget": 5000000
    }
  ]
}
```

**Example: Submit Claim**
```bash
curl -X POST "https://yourdomain.com/api/webhooks/n8n/claims" \
  -H "Authorization: Bearer your_webhook_secret" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+6281234567890",
    "travelRequestId": "clx123abc",
    "claimType": "NON_ENTERTAINMENT",
    "expenseCategory": "TRANSPORT",
    "expenseDate": "2026-01-15T00:00:00.000Z",
    "expenseDestination": "Jakarta",
    "customerName": "PT ABC Corp",
    "amount": 125000,
    "description": "Taxi from airport to client office",
    "notes": "Blue Bird Taxi",
    "attachmentUrl": "https://temp-storage.example.com/receipt123.jpg",
    "attachmentMimeType": "image/jpeg",
    "attachmentFilename": "taxi_receipt.jpg",
    "submittedVia": "whatsapp"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "claimId": "cly456def",
    "claimNumber": "CLM-202601-0156",
    "status": "SUBMITTED",
    "amount": 125000
  }
}
```

---

## Appendix C: Prompt Templates Reference

**System Prompt:**
```
You are a helpful travel expense claim assistant for a company's Travel and Claim Management System...
[See Section 4.2 for full prompt]
```

**Function Definitions:**
```json
[
  {
    "name": "extract_receipt_data",
    "description": "Extract structured data from a receipt image",
    ...
  },
  {
    "name": "determine_claim_type",
    ...
  },
  {
    "name": "collect_missing_fields",
    ...
  }
]
```

[See Section 4.2 for complete function definitions]

---

**Document Version:** 1.0  
**Author:** System Architect  
**Date:** 2026-02-06  
**Status:** Design Specification - Ready for Review

**Next Action:** Review and approve design, then proceed to implementation using Code mode.