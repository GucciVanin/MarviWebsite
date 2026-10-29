namespace Marvi.Api.Features.Contact;

/// <summary>The contact feature (MRV-2.8) has no services of its own to register: its controllers use the shared DbContext and audit logger.</summary>
public static class ContactModule
{
    public static IServiceCollection AddContactFeature(this IServiceCollection services) => services;
}
