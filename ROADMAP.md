# Development Roadmap

This document outlines the current state and future development tasks for the ESPN Fantasy Baseball Assistant.

## ✅ Completed (v0.1)

### Core Infrastructure

- [x] Monorepo setup with Turbo
- [x] PostgreSQL database schema with Kysely
- [x] Database migration system
- [x] Backend API with Fastify
- [x] Next.js frontend with App Router
- [x] Shared types package

### Agents

- [x] ESPN Adapter with schema drift detection
- [x] Projections Ingest Agent (FanGraphs CSV)
- [x] Player Identity Resolution Agent
- [x] Standings Projection Agent with component math
- [x] Waiver Recommendation Agent (basic)
- [x] Snapshot Orchestrator Agent
- [x] Background worker with BullMQ

### API Endpoints

- [x] League connection and status
- [x] Projections upload and listing
- [x] Time series queries (overall, category ranks, projections)
- [x] Transaction annotations
- [x] Waiver recommendations endpoint

### Frontend

- [x] Basic Next.js App Router setup
- [x] TanStack Query integration
- [x] Tailwind CSS styling
- [x] API client library
- [x] Home page with nav

## 🚧 In Progress

### Backend

- [ ] Complete ESPN data normalization for all views
- [ ] Implement comprehensive component validation
- [ ] Add robust error handling and retry logic
- [ ] Implement rate limiting for ESPN calls

### Frontend

- [ ] Leagues list and detail pages
- [ ] Projections upload UI with drag-drop
- [ ] Time series graphs with Recharts
- [ ] Transaction overlay visualization
- [ ] Team roster view
- [ ] Responsive mobile design

## 📋 Planned Features

### v0.2 - Core Features Complete

#### Backend

- [ ] Trade Recommendation Agent
  - [ ] Impact analysis for proposed trades
  - [ ] Candidate trade generation (1-for-1, 2-for-2)
  - [ ] Fairness scoring
- [ ] Draft Assistant Agent
  - [ ] Snake draft recommendations
  - [ ] Auction draft valuation
  - [ ] Scarcity analysis
- [ ] Time Series Query Agent optimizations
  - [ ] Efficient date range queries
  - [ ] Aggregation and rollups
  - [ ] Export capabilities

#### Frontend

- [ ] Complete leagues page
  - [ ] League list with status cards
  - [ ] League detail dashboard
  - [ ] Team selector
- [ ] Projections management
  - [ ] Upload interface with validation
  - [ ] Coverage report visualization
  - [ ] Unmapped players resolution UI
- [ ] Trends/graphs page
  - [ ] Overall standings over time
  - [ ] Per-category rank charts
  - [ ] Projected vs actual comparison
  - [ ] Interactive date range selector
- [ ] Waivers page
  - [ ] Ranked recommendations table
  - [ ] Category impact visualization
  - [ ] Free agent search
  - [ ] Mock add/drop simulator

### v0.3 - Enhanced Analytics

- [ ] Advanced trade analyzer
  - [ ] Multi-team trade support (3+ teams)
  - [ ] Keeper/dynasty value adjustments
  - [ ] Historical trade outcomes
- [ ] Category targeting
  - [ ] "Punt category" strategy optimizer
  - [ ] Category scarcity dashboard
  - [ ] Streaming projections
- [ ] Player performance tracking
  - [ ] Hot/cold streaks detection
  - [ ] Injury risk indicators
  - [ ] Playing time projections

### v0.4 - User Experience

- [ ] User authentication
  - [ ] Email/password login
  - [ ] Multiple league support per user
  - [ ] Secure cookie storage
- [ ] Notifications
  - [ ] Email alerts for waiver opportunities
  - [ ] Push notifications (mobile)
  - [ ] Webhook integrations (Slack, Discord)
- [ ] Mobile app
  - [ ] React Native or PWA
  - [ ] Push notifications
  - [ ] Offline mode

### v1.0 - Production Ready

- [ ] Performance optimizations
  - [ ] Database query optimization
  - [ ] Caching strategy refinement
  - [ ] Frontend bundle optimization
- [ ] Testing
  - [ ] Unit tests (>80% coverage)
  - [ ] Integration tests
  - [ ] End-to-end tests
- [ ] Documentation
  - [ ] API documentation (OpenAPI/Swagger)
  - [ ] User guide
  - [ ] Admin documentation
- [ ] Deployment
  - [ ] Docker containerization
  - [ ] CI/CD pipeline
  - [ ] Production monitoring
  - [ ] Error tracking (Sentry)
  - [ ] Analytics

## 🔮 Future Considerations

### Advanced Features

- [ ] Real-time updates (WebSocket)
- [ ] Automated lineup optimization
- [ ] Machine learning projections
- [ ] Historical league data analysis
- [ ] Custom scoring formats
- [ ] Dynasty/keeper league support
- [ ] Salary cap management

### Integrations

- [ ] Multiple projection sources (Steamer, ZiPS, THE BAT)
- [ ] Ensemble projection model
- [ ] News and injury data integration
- [ ] Twitter/social sentiment analysis

### Platform Expansion

- [ ] Support for other ESPN fantasy sports (football, basketball)
- [ ] Support for Yahoo, CBS leagues
- [ ] Custom league formats

## 📝 Notes

### Known Limitations (v0.1)

1. ESPN adapter only handles basic league structure
2. Projections require manual CSV upload (no auto-fetch)
3. Player identity resolution is fuzzy (no confirmed ID mapping)
4. Rate stats calculations assume complete component data
5. Waiver recommendations don't check roster legality thoroughly
6. No authentication/authorization system
7. No automated daily snapshot scheduling (requires manual trigger or cron)

### Technical Debt

- Add comprehensive error handling
- Implement proper logging infrastructure
- Add monitoring and alerting
- Create comprehensive test suite
- Document all API endpoints
- Add input validation with Zod schemas
- Optimize database queries with proper indexing

### Design Decisions to Revisit

- Consider GraphQL for more flexible frontend queries
- Evaluate moving to tRPC for type-safe API
- Consider splitting workers into separate microservices
- Evaluate serverless deployment options
