# Client Portal & Ticketing Scope

## Portal v1 pages

- Login  
- Dashboard  
- Plant list  
- Plant detail  
- Inspection reports  
- Report detail / download  
- Device inventory list  
- Device detail  
- Support tickets  
- Ticket detail  
- Account settings  

### Dashboard widgets

- Latest inspections  
- Open findings  
- Open tickets  
- Critical devices  
- Recently uploaded reports  

### Plant detail

- Facility profile  
- Last inspection date  
- Inspection history  
- Current safety-device inventory  
- Active findings  
- Related documents  
- Open tickets  

### Device detail

- Current installed data  
- Inspection history  
- AI device intelligence  
- Vendor options  
- Replacement recommendation  
- Caldaia stock availability (when applicable)  

## Portal v2 (later)

- Analytics dashboards  
- Maintenance planning calendar  
- Upcoming semiannual schedules  
- Export center  
- Renewal / contract status  

## Support ticket workflow (v1)

1. Client submits ticket from portal  
2. Ticket linked to plant and optionally device  
3. Internal triage and assignment  
4. Threaded updates visible to client  
5. Attachments supported  
6. Later: convert to field dispatch  

### Future expansion

- SLA rules  
- Automatic routing  
- AI summarization  
- Suggested replacement part from linked device  
- Service dispatch generation  

## Design constraint

Keep v1 focused on **reports, inventory, and tickets**. Avoid portal sprawl before the system of record is trusted.

## Internal inventory strategy (Phase 2+)

Track Caldaia-owned spare inventory; link parts to compatible devices; recommend truck stock and warehouse candidates.

### Decision engine inputs

- Failure frequency  
- Number of sites using the device  
- Lead-time volatility  
- Part criticality  
- Margin opportunity  
- Storage cost  

### Outcomes

- Stock now  
- Monitor demand  
- Special order only  

## Roles (access)

See [development-plan.md](./development-plan.md) § Multi-tenant access. RLS is mandatory.
