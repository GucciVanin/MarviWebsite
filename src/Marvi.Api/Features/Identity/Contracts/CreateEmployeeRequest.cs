namespace Marvi.Api.Features.Identity.Contracts;

public record CreateEmployeeRequest(string Email, string Password, string EmployeeCode, string? Department, DateTime HireDate);
