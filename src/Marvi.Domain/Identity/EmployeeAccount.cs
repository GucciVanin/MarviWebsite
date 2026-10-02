namespace Marvi.Domain.Identity;

public class EmployeeAccount
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string EmployeeCode { get; set; } = string.Empty;
    public string? Department { get; set; }
    public DateTime HireDate { get; set; }
}
