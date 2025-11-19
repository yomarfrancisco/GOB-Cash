# GoBankless Cash-Card UI

A minimal, mobile-only Next.js application showcasing the GoBankless cash-card interface. Built with TypeScript, App Router, and vanilla CSS (no Tailwind).

## Quickstart

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Start the development server:**
   ```bash
   pnpm dev
   ```

3. **Open your browser:**
   Navigate to [http://localhost:5173](http://localhost:5173)

## Routes

- `/` - Home (wallet with card stack)
- `/profile` - Profile (glass bars only for now)

## Project Structure

```
GoBankless/
├── public/
│   └── assets/          # Image and SVG assets (see Asset Management below)
├── src/
│   ├── components/
│   │   ├── TopGlassBar.tsx    # Top glass bar component
│   │   ├── BottomGlassBar.tsx # Bottom glass bar component
│   │   └── CardStack.tsx      # Card stack component
│   └── app/
│       ├── api/         # API routes
│       ├── profile/     # Profile page
│       ├── globals.css  # Global styles
│       ├── layout.tsx   # Root layout
│       └── page.tsx     # Main dashboard page
└── package.json
```

## Asset Management

### Location
All image and SVG assets are stored in `/public/assets/` and referenced via `/assets/...` paths in the code.

### Naming Rules
- **Kebab-case only**: Use lowercase letters, numbers, and hyphens
- **No spaces or special characters**: Avoid underscores, spaces, or special symbols
- **Preserve extensions**: Keep original file extensions (`.png`, `.jpg`, `.svg`)

### Example Asset Names
- `glass-top-1.png` ✅
- `gobankless-logo.png` ✅
- `card-pepe.jpg` ✅
- `user-outlined.svg` ✅

### Adding New Assets
1. Place the file in `/public/assets/`
2. Rename to kebab-case (e.g., `My Image.png` → `my-image.png`)
3. Reference in code as `/assets/my-image.png`

## Customization

### Changing the Mobile Frame Width

The mobile frame is fixed at **430px** width. To change it:

1. **Update CSS** in `src/app/globals.css`:
   ```css
   .mobile-frame {
     width: 430px;  /* Change this value */
     /* ... */
   }
   ```

2. **Update max-width** in `src/app/globals.css`:
   ```css
   .dashboard-container {
     max-width: 430px;  /* Match the mobile-frame width */
     /* ... */
   }
   ```

3. **Update card stack** if needed:
   ```css
   .card-stack {
     max-width: 398px;  /* Adjust relative to frame width */
     /* ... */
   }
   ```

## Deployment

### Deploy to Vercel

1. **Install Vercel CLI** (if not already installed):
   ```bash
   pnpm add -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel
   ```

3. **Or connect via GitHub:**
   - Push your code to a GitHub repository
   - Import the project in [Vercel Dashboard](https://vercel.com/dashboard)
   - Vercel will automatically detect Next.js and configure the build

### Build for Production

```bash
pnpm build
pnpm start
```

The production server will run on port **4173** (configured in `package.json`).

## API Routes

### Health Check

- **Endpoint:** `/api/health`
- **Method:** `GET`
- **Response:**
  ```json
  {
    "ok": true
  }
  ```

Use this endpoint to verify the application is running correctly.

## Development

### Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Vanilla CSS (no Tailwind)
- **Package Manager:** pnpm

### Available Scripts

- `pnpm dev` - Start development server on port 5173
- `pnpm build` - Build for production
- `pnpm start` - Start production server on port 4173
- `pnpm lint` - Run ESLint

## Notes

- The application is **mobile-only** and designed for a 430px viewport
- All assets use kebab-case naming for consistency
- The UI includes interactive card stacking, hover states, and glass texture effects
- Font: Inter (loaded via Next.js font optimization)

