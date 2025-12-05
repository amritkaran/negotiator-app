# negotiator-app

Your personal AI agent that finds the best local vendors for all your needs at best prices.

## Features

- AI-powered voice bot for negotiating cab/taxi services
- Chat interface for requirement collection (OpenAI GPT-4o)
- Google Maps integration for vendor discovery
- Perplexity API for real-time price intelligence
- VAPI integration for outbound voice calls
- Human-in-the-loop support for complex negotiations
- Vendor prioritization with fuzzy name matching
- Multi-language support (English/Hindi)

## Getting Started

1. Copy `.env.example` to `.env.local` and fill in your API keys
2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Environment Variables

See `.env.example` for required API keys:
- `OPENAI_API_KEY` - OpenAI API key
- `GOOGLE_MAPS_API_KEY` - Google Maps API key
- `PERPLEXITY_API_KEY` - Perplexity API key
- `VAPI_API_KEY` - VAPI API key
- `VAPI_PHONE_NUMBER_ID` - VAPI phone number ID
- `VAPI_SERVER_URL` - Your app URL for webhooks

## Deployment

Deploy on Vercel:
1. Import this repository
2. Add environment variables
3. Deploy
