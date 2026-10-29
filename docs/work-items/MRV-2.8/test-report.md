# Test report MRV-2.8 (running)
## 2.8a (2026-10-28)
Environment: Windows 11, .NET 10 (`dotnet test test/Marvi.Tests`), InMemory DB; runtime suite on Postgres in its own compose project.
API suite x3: 416 pass, 0 fail each. Runtime suite: 340 pass (one run, before the honeypot/size-limit fixes). Pinned data: fixed strings in tests; UTC timestamps asserted within a window.
