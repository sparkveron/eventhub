# EventHub

EventHub is a full-stack event discovery, ticket reservation, and organizer-management
platform. Attendees can discover published events, reserve tickets, complete a hosted
Paystack test-mode checkout, manage bookings, and access printable digital tickets.
Organizers can publish events, manage ticket inventory, review organizer-scoped
bookings, and monitor event and portfolio-level performance.

## Highlights

- JWT registration, login, session restoration, token refresh, and role-aware routing
- Public event discovery with search, category and city filters, ordering, and pagination
- Organizer event publishing, editing, deletion, ticket management, and protected dashboards
- Transaction-safe booking creation with row locking and server-calculated totals
- Ten-minute pending reservations with idempotent inventory release on expiration
- Attendee booking history, cancellation, reservation countdowns, and printable tickets
- Organizer-scoped analytics, booking management, and event-level performance metrics
- Hosted Paystack checkout with server-side verification and signed webhook processing
- Responsive React interface with accessible loading, error, empty, and dialog states

## Technology

| Layer | Technology |
| --- | --- |
| Backend | Python, Django, Django REST Framework |
| Authentication | SimpleJWT |
| Database | PostgreSQL |
| Payments | Paystack hosted checkout and webhooks |
| Frontend | React, TypeScript, Vite, Tailwind CSS v4 |
| Routing | React Router |
| Media | Django `ImageField` uploads during development |

## Architecture

```text
eventHub/
|-- backend/
|   |-- accounts/      # Authentication and attendee/organizer profiles
|   |-- events/        # Categories, events, tickets, and organizer analytics
|   |-- bookings/      # Reservations, inventory, payments, and expiration
|   |-- config/        # Django settings and root URLs
|   |-- scripts/       # Windows reservation-expiration scheduler helpers
|   `-- manage.py
|-- frontend/
|   `-- src/           # React pages, components, contexts, services, and types
`-- docs/screenshots/  # Portfolio screenshot checklist
```

The React client communicates with the Django API through `VITE_API_URL`. Django
keeps booking totals, ticket inventory, reservation expiration, payment verification,
and authorization authoritative on the server.

## Prerequisites

- Python 3.13+
- Node.js 22+ and npm
- PostgreSQL with permission to create and migrate a database
- A Paystack test account for checkout testing (optional for non-payment development)

## Backend Setup

From the project root:

```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

On macOS or Linux, activate the environment with `source venv/bin/activate` and
copy the environment file with `cp .env.example .env`.

Create a PostgreSQL database named `eventhub`, then configure `backend/.env`:

```dotenv
DB_NAME=eventhub
DB_USER=postgres
DB_PASSWORD=your-local-database-password
DB_HOST=127.0.0.1
DB_PORT=5432
DJANGO_SECRET_KEY=generate-a-unique-local-secret
ALLOWED_HOSTS=localhost,127.0.0.1
PAYSTACK_SECRET_KEY=
PAYSTACK_CURRENCY=GHS
PAYSTACK_CALLBACK_URL=http://localhost:5173/payment/return
PAYSTACK_TIMEOUT_SECONDS=10
```

Generate a Django signing key after installing the requirements:

```powershell
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Store the output only in `backend/.env`. Never commit that file.

Apply migrations and start Django on the port expected by the frontend example:

```powershell
python manage.py migrate
python manage.py runserver 127.0.0.1:8001
```

The API is available at `http://127.0.0.1:8001/api/` and Django admin at
`http://127.0.0.1:8001/admin/`.

## Frontend Setup

In a second terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

The development client runs at `http://localhost:5173/`. Its local configuration is:

```dotenv
VITE_API_URL=http://127.0.0.1:8001/api
VITE_CURRENCY=GHS
```

Only variables prefixed with `VITE_` are exposed to browser code. Never place the
Paystack secret key or database credentials in the frontend environment.

## Reservation Expiration

Pending bookings reserve inventory for ten minutes. Run the expiration command regularly
so overdue reservations release their tickets even when no attendee is online:

```powershell
python manage.py expire_bookings
```

For Windows development, `backend/scripts/register_expire_bookings_task.ps1` registers
the `EventHub-ExpireBookings` scheduled task to run every minute using the backend virtual
environment. Run it from PowerShell after the backend environment is configured:

```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\register_expire_bookings_task.ps1
schtasks.exe /Query /TN "EventHub-ExpireBookings" /FO LIST /V
```

Runtime output is written to `backend/logs/expire_bookings.log`, which is ignored by Git.

## Paystack Test Mode

EventHub currently prices and initializes Paystack transactions in **GHS**. The backend
and frontend currency variables must remain aligned; the application does not perform
currency conversion.

1. Add a Paystack **test secret key** to `PAYSTACK_SECRET_KEY` in `backend/.env`.
2. Keep `PAYSTACK_CURRENCY=GHS` and `VITE_CURRENCY=GHS` unless prices and the merchant
   account are deliberately migrated together.
3. Set `PAYSTACK_CALLBACK_URL` to the frontend `/payment/return` route.
4. Expose the local Django server through a temporary public HTTPS tunnel.
5. Add the tunnel hostname to `ALLOWED_HOSTS`.
6. In the Paystack test dashboard, set the webhook URL to:

   ```text
   https://YOUR-PUBLIC-HTTPS-HOST/api/payments/paystack/webhook/
   ```

Temporary tunnel URLs are not permanent and must be updated when they rotate. For a stable
environment, use a persistent tunnel or a deployed HTTPS backend. Payment confirmation is
performed by server-side verification; the browser callback alone never confirms a booking.

## Tests and Build

Run the backend system check and complete Django test suite:

```powershell
cd backend
venv\Scripts\python.exe manage.py check
venv\Scripts\python.exe manage.py test
```

Build the frontend with TypeScript checking:

```powershell
cd frontend
npm.cmd run build
```

Tests use Django's isolated test database and do not depend on development records.
External Paystack calls are mocked in automated tests.

## API Overview

- `/api/auth/` - registration, login, token refresh, and current user
- `/api/events/` - public discovery and organizer event management
- `/api/events/analytics/` - organizer-wide analytics
- `/api/events/<id>/performance/` - event-level performance
- `/api/bookings/` - attendee booking creation and management
- `/api/bookings/organizer/` - organizer-scoped booking review
- `/api/payments/paystack/webhook/` - signed Paystack webhook receiver

## Security Notes

- Secrets and local environment files are excluded from version control.
- Booking ownership and organizer ownership are enforced server-side.
- Inventory changes use database transactions and row locks.
- Paystack webhooks require an HMAC-SHA512 signature and are verified server-side.
- Payment amounts, currency, and booking references are derived or validated by Django.
- Late payments never reactivate expired reservations automatically.

## Portfolio Screenshots

The recommended, privacy-safe screenshot set is documented in
[`docs/screenshots/README.md`](docs/screenshots/README.md). Add only captures from the real
running application and remove personal data, tokens, and transaction identifiers first.
