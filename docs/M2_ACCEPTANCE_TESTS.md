# M2 Acceptance Checklist

## Client test
1. Open Clients.
2. Add a client with:
   - Client name
   - Contact person
   - Phone
   - Email
   - Address
   - At least one tag
3. Confirm the client remains after browser refresh.
4. Select the client and confirm details show in the right panel.
5. Edit one field and save.
6. Confirm client search works.

## Project test
1. Open Projects.
2. Add a project under the client created above.
3. Add project code, location, description and tag.
4. Confirm the project remains after browser refresh.
5. Confirm client filter and project search work.
6. Edit the project and save.

## Global search test
1. Press Ctrl+K.
2. Search using:
   - Client name
   - Client phone
   - Project name
   - Project code
   - Project location
   - Tag
3. Confirm matching client/project results appear.
4. Open Global Search from the sidebar.
5. Search again and filter between Clients and Projects.

## Dashboard
1. Confirm the client count is updated.
2. Confirm the project count is updated.

## Persistence
Local development data is stored in:
data/workspace.json

This file is intentionally excluded from Git so real local business data does not become source-code history.

## M2 architecture note
M2 uses a local server-side JSON storage adapter for localhost-first development.
The UI/API boundaries are intentionally separated so persistent storage can later be replaced by Supabase/PostgreSQL without rebuilding the client/project screens.
