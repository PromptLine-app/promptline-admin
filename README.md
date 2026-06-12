# PromptLine Admin Dashboard

The internal operations and analytics command center for the PromptLine AI platform. 

## Features
- **Real-Time KPIs**: Live monitoring of Monthly Recurring Revenue (MRR), active subscriptions, and platform-wide call volume.
- **Business Management**: Search, view, and manage all active businesses on the platform. Toggle AI agent status (Enable/Disable) and view billing plans.
- **Revenue Analytics**: Track complete transaction ledgers, including succeeded payments, refunds, and pending charges.
- **Call Analytics**: Live feed of the most recent AI phone calls handled across all businesses.
- **Promo Codes**: 1-click generator for trial bypass codes to distribute to VIP clients.
- **Team Management & Audit Log**: Role-based access control (`admin` vs `viewer`) with an immutable audit log tracking all administrative actions.

## Tech Stack
- **Framework**: React + Vite (TypeScript)
- **Routing**: React Router DOM
- **Database / Auth**: Supabase (utilizes Service Role for admin overrides)
- **Styling**: Vanilla CSS with CSS Variables
- **Charts**: Recharts

## Local Development

### Setup
1. Clone the repository.
2. Run `npm install`.
3. Create a `.env` file in the root directory.

### Environment Variables
You will need the following keys from your Supabase project:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```
*(Note: Because this is an internal admin tool, the Service Role key is utilized to bypass Row-Level Security and allow global management of all tenants. Do not expose this app publicly without proper authentication guards).*

### Running
Start the development server:
```bash
npm run dev
```

## Deployment
This project is configured to be deployed on **Vercel**. 

Ensure you add the environment variables listed above in your Vercel project settings. The included `vercel.json` handles client-side routing automatically so that you do not get 404 errors when refreshing pages.
