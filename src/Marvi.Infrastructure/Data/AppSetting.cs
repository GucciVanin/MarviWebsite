namespace Marvi.Infrastructure.Data;

/// <summary>
/// One named value kept in the database itself (table <c>app_settings</c>). Today it holds a single thing: the keyed fingerprint of
/// <c>Privacy:CpfHashKey</c> (MRV-9.4), so a changed key is noticed at startup instead of silently breaking the CPF uniqueness check.
/// Never put a secret here: only values that are safe to read next to the data they protect.
/// </summary>
public class AppSetting
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}
