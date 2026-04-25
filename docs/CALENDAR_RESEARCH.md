# Calendar & Scheduling — Research & Recommendations for GearUp

## What We Need

GearUp needs two internal calendar views (admin-only) and a customer-facing slot picker:

1. **Appointment Calendar** — day/week view of all appointments, color-coded by status, click-to-create
2. **Worker Calendar** — week view per worker showing assignments, shifts, leave
3. **Customer Slot Picker** — date picker + available time slots on the public booking page

Our data model already handles the scheduling logic (slot rules, holidays, blocked slots, worker capacity). We only need **UI rendering** — not a scheduling engine.

---

## Option 1: React UI Calendar Libraries (embed in our app)

These are React components you drop into your pages. They render calendar grids and handle drag/drop — you supply the data.

### Free / Open Source

| Library | GitHub Stars | License | Bundle Size | Key Features | Limitations |
|---------|-------------|---------|-------------|--------------|-------------|
| **FullCalendar** | 18k+ | MIT (core) | ~45kb | Day/week/month/list views, drag-drop, Google Calendar sync, plugin system, Next.js compatible | Resource/timeline views require Premium ($480/dev). Most mature option. |
| **react-big-calendar** | 7.5k+ | MIT | ~30kb | Week/month/agenda views, drag-drop, custom event rendering, good for basic scheduling | No resource view (can't show workers as rows). No timeline. Aging codebase. |
| **Schedule-X** | 1.5k+ | MIT | ~15kb | Modern, lightweight, day/week/month views, dark mode, clean API | Newer project, smaller community. No resource view yet. |
| **EventCalendar (vkurko)** | 1.6k+ | MIT | ~25kb | Full-sized drag-drop calendar, resource & timeline views, lightweight | Less documentation, smaller ecosystem. |
| **DayPilot Lite** | — | Apache 2.0 | ~40kb | Timeline/scheduler view, drag-drop, free for commercial use | Limited features vs Pro. Basic styling. |

### Commercial / Paid

| Library | Price | Key Advantage | Best For |
|---------|-------|---------------|----------|
| **FullCalendar Premium** | $480/dev (one-time) | Resource timeline views, optimized printing | Adding resource views to the free core |
| **DHTMLX Scheduler** | $1,299 (5 devs) | 10 views, React-native wrapper, deep customization | Enterprise scheduling apps |
| **Bryntum Scheduler** | $2,040 (3 devs) | Grid-based, dependencies, milestones, Gantt-like | Complex resource planning |
| **Syncfusion Scheduler** | Quote-based (suite) | 5 timeline variations, state persistence, theme studio | Teams already using Syncfusion |
| **DayPilot Pro** | $649+ | Gantt/timesheet views, visual builder, row management | Balancing features vs cost |

### Verdict for GearUp

**FullCalendar (free core)** is the best fit:
- MIT licensed, zero cost
- Day/week/month views cover appointment calendar needs
- Huge community, 10+ years mature, works with Next.js
- We don't need resource timeline views (worker calendar is simpler — just a filtered list per worker)
- If we later need resource views, Premium is a one-time $480

**Schedule-X** is the runner-up if we want something more modern and lightweight, but it has a smaller community.

---

## Option 2: Full Scheduling Platforms (replace our scheduling logic)

These are standalone scheduling systems — not just UI components. They handle availability, booking, notifications, etc.

### Open Source / Self-Hosted

| Platform | Tech Stack | License | What It Does | Fit for GearUp? |
|----------|-----------|---------|--------------|-----------------|
| **Cal.com / Cal.diy** | Next.js, Prisma, tRPC | MIT (Cal.diy) | Meeting scheduling (like Calendly), embeddable booking pages, Google/Outlook sync | ❌ Designed for 1:1 meetings, not multi-resource workshop scheduling. No concept of bays, workers, or job cards. |
| **Easy!Appointments** | PHP, MySQL | GPL-3.0 | Service-based appointment booking, staff management, Google Calendar sync | ⚠️ Closer to our use case but PHP-based, separate system. Would need API integration. No job card / invoice concept. |

### Commercial (Auto Repair Specific)

| Software | Price | What It Does |
|----------|-------|--------------|
| **Shopmonkey** | $199+/mo | Full shop management — scheduling, estimates, invoicing, parts ordering, DVI |
| **Tekmetric** | $199+/mo | Cloud shop management — drag-drop scheduling, bay tracking, workflow automation |
| **ARI** | Free tier available | Invoicing, estimates, AI labor guides, basic scheduling |

### Verdict for GearUp

**Don't use any of these.** Here's why:

- Cal.com/Easy!Appointments solve a different problem (meeting scheduling, not workshop management)
- Shopmonkey/Tekmetric are competitors to GearUp itself — you'd be replacing your app, not enhancing it
- Our scheduling logic already exists in the database (AppointmentSlotRule, BlockedSlot, Holiday, WorkerLeave)
- We just need a **calendar UI** to visualize what's already there

---

## Option 3: Build Custom (CSS Grid)

Build a simple calendar grid using CSS Grid + our existing data. No library dependency.

| Pros | Cons |
|------|------|
| Zero bundle size increase | More dev time upfront |
| Full control over look & feel | No drag-drop out of the box |
| Matches our Tailwind design system | Need to handle edge cases (overflow, timezone, etc.) |
| No license concerns | Reinventing solved problems |

### Verdict

Viable for the **worker calendar** (simpler view) and **customer slot picker** (just buttons). Overkill to build the appointment calendar from scratch when FullCalendar exists.

---

## Recommendation

Use a **hybrid approach**:

| View | Solution | Why |
|------|----------|-----|
| **Appointment Calendar** (admin) | FullCalendar (MIT core) | Mature, day/week views, drag-drop, event click handlers. Fetch from `GET /admin/appointments` and render. |
| **Worker Calendar** (admin) | Custom CSS Grid | Simple week grid showing assignments per worker. No drag-drop needed. Just colored blocks per day. |
| **Customer Slot Picker** (public) | Custom component | Date picker + button grid of available slots. Already have `GET /api/public/available-slots`. Just needs UI. |

### Implementation Effort

| Component | Estimated Effort | Dependencies to Add |
|-----------|-----------------|-------------------|
| Appointment Calendar | ~4 hours | `@fullcalendar/core`, `@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction` |
| Worker Calendar | ~2 hours | None (Tailwind CSS Grid) |
| Customer Slot Picker | ~1 hour | None (already have the API) |

### Total: ~7 hours, $0 in licensing costs.

---

## Summary Table

| Approach | Cost | Effort | Maintenance | Fit |
|----------|------|--------|-------------|-----|
| FullCalendar (free) + custom | $0 | Low | Low | ✅ Best |
| Schedule-X + custom | $0 | Low | Medium (newer) | ✅ Good |
| FullCalendar Premium | $480 | Low | Low | Overkill |
| DHTMLX / Bryntum / Syncfusion | $1,300–$6,000 | Low | Low | Overkill |
| Cal.com / Easy!Appointments | $0 | High (integration) | High | ❌ Wrong tool |
| Shopmonkey / Tekmetric | $200+/mo | N/A | N/A | ❌ Competitor |
| Fully custom | $0 | High | Medium | ⚠️ Only for simple views |
