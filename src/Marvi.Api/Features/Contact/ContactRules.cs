using Marvi.Api.Features.Admin;
using Marvi.Api.Features.Contact.Contracts;
using Marvi.Api.Features.Identity;
using Marvi.Domain.Contact;

namespace Marvi.Api.Features.Contact;

/// <summary>
/// The contact form's input rules (MRV-2.8). Problems name the field only: the visitor's text is never echoed back or logged.
/// </summary>
public static class ContactRules
{
    public sealed record Checked(ContactMessage? Message, Dictionary<string, string[]> Problems);

    public static Checked Check(ContactRequest request)
    {
        var problems = new Dictionary<string, string[]>();

        var name = AdminInput.Clean(request.Name);
        if (name.Length == 0) problems["name"] = ["Name is required."];
        else if (name.Length > ContactMessage.MaxNameLength) problems["name"] = [$"Name must be at most {ContactMessage.MaxNameLength} characters."];

        var email = AdminInput.Clean(request.Email);
        if (email.Length == 0) problems["email"] = ["Email is required."];
        else if (email.Length > ContactMessage.MaxEmailLength || !EmailAddressValidator.IsValid(email)) problems["email"] = ["Email is not valid."];

        var phone = AdminInput.Clean(request.Phone);
        if (phone.Length > ContactMessage.MaxPhoneLength) problems["phone"] = [$"Phone must be at most {ContactMessage.MaxPhoneLength} characters."];

        var company = AdminInput.Clean(request.Company);
        if (company.Length > ContactMessage.MaxCompanyLength) problems["company"] = [$"Company must be at most {ContactMessage.MaxCompanyLength} characters."];

        var message = AdminInput.Clean(request.Message);
        if (message.Length == 0) problems["message"] = ["Message is required."];
        else if (message.Length < ContactMessage.MinMessageLength) problems["message"] = [$"Message must be at least {ContactMessage.MinMessageLength} characters."];
        else if (message.Length > ContactMessage.MaxMessageLength) problems["message"] = [$"Message must be at most {ContactMessage.MaxMessageLength} characters."];

        // The database cannot store a NUL character; refuse it here as a field problem.
        foreach (var (field, value) in new[] { ("name", name), ("email", email), ("phone", phone), ("company", company), ("message", message) })
        {
            if (value.Contains('\0') && !problems.ContainsKey(field))
            {
                problems[field] = ["Contains characters that cannot be stored."];
            }
        }

        if (problems.Count > 0)
        {
            return new Checked(null, problems);
        }

        return new Checked(new ContactMessage
        {
            Id = Guid.NewGuid(),
            Name = name,
            Email = email,
            Phone = phone.Length == 0 ? null : phone,
            Company = company.Length == 0 ? null : company,
            Message = message,
            CreatedAt = DateTime.UtcNow,
        }, problems);
    }
}
