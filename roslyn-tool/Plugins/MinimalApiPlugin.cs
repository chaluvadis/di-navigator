namespace DIServiceAnalyzer.Plugins;

public class MinimalApiPlugin : AnalyzerPluginBase
{
    public override string Name => "Minimal API Plugin";
    public override string Version => "1.0.0";
    public override string Description => "Analyzes Minimal API projects for dependency injection patterns";

    public override bool CanHandleProject(string projectType)
    {
        return projectType.Contains("Minimal API", StringComparison.OrdinalIgnoreCase) ||
               projectType.Contains("ASP.NET Core Web Application", StringComparison.OrdinalIgnoreCase);
    }

    public override async Task<List<ServiceRegistration>> AnalyzeProjectAsync(ProjectAnalysis project, CancellationToken cancellationToken = default)
    {
        LogInfo($"Analyzing Minimal API project: {project.ProjectName}");

        var registrations = new List<ServiceRegistration>();

        // Custom analysis logic for Minimal API projects
        foreach (var sourceFile in project.ServiceRegistrations
            .Where(sr => sr.FilePath.EndsWith("Program.cs", StringComparison.OrdinalIgnoreCase))
            .GroupBy(sr => sr.FilePath))
        {
            LogDebug($"Processing Program.cs file: {sourceFile.Key}");

            // Look for Minimal API specific patterns
            var programRegistrations = sourceFile
                .Where(sr => sr.RegistrationMethod.Contains("Map") ||
                           sr.RegistrationMethod.Contains("Use") ||
                           sr.RegistrationMethod.Contains("Add"))
                .ToList();

            registrations.AddRange(programRegistrations);
        }

        return registrations;
    }

    public override async Task<List<CustomRegistry>> DetectCustomRegistriesAsync(ProjectAnalysis project, CancellationToken cancellationToken = default)
    {
        LogInfo($"Detecting custom registries in Minimal API project: {project.ProjectName}");

        var customRegistries = new List<CustomRegistry>();

        try
        {
            // Look for Minimal API specific patterns in Program.cs
            var programFiles = project.ServiceRegistrations
                .Where(sr => sr.FilePath.EndsWith("Program.cs", StringComparison.OrdinalIgnoreCase))
                .GroupBy(sr => sr.FilePath)
                .ToList();

            foreach (var fileGroup in programFiles)
            {
                // Check for Minimal API specific registration patterns
                var minimalApiRegistrations = fileGroup
                    .Where(sr => sr.RegistrationMethod.Contains("Map") ||
                               sr.RegistrationMethod.Contains("Use") ||
                               sr.RegistrationMethod.Contains("Add"))
                    .ToList();

                if (minimalApiRegistrations.Any())
                {
                    customRegistries.Add(new CustomRegistry
                    {
                        RegistryName = "MinimalApiConfiguration",
                        RegistryType = "ProgramConfiguration",
                        FilePath = fileGroup.Key,
                        LineNumber = minimalApiRegistrations.Min(sr => sr.LineNumber),
                        RegisteredServices = minimalApiRegistrations
                            .Select(sr => $"{sr.ServiceType} ({sr.RegistrationMethod})")
                            .Distinct()
                            .ToList()
                    });
                }
            }
        }
        catch (Exception ex)
        {
            LogError("Error detecting custom registries", ex);
        }

        return customRegistries;
    }

    public override async Task<List<ServiceLifetimeConflict>> AnalyzeLifetimeConflictsAsync(List<ProjectAnalysis> projects, CancellationToken cancellationToken = default)
    {
        LogInfo("Analyzing lifetime conflicts in Minimal API projects");

        var conflicts = new List<ServiceLifetimeConflict>();

        try
        {
            foreach (var project in projects)
            {
                // Check for Minimal API specific lifetime issues
                foreach (var group in project.ServiceRegistrations.GroupBy(sr => new { sr.ServiceType, sr.ImplementationType }))
                {
                    var registrations = group.ToList();

                    // Check for multiple lifetime registrations
                    var lifetimeGroups = registrations.GroupBy(r => r.Lifetime).ToList();
                    if (lifetimeGroups.Count > 1)
                    {
                        var primaryLifetime = lifetimeGroups
                            .OrderBy(lg => GetLifetimePriority(lg.Key))
                            .First().Key;

                        foreach (var conflictingGroup in lifetimeGroups.Skip(1))
                        {
                            foreach (var registration in conflictingGroup)
                            {
                                conflicts.Add(new ServiceLifetimeConflict
                                {
                                    ServiceType = registration.ServiceType,
                                    ImplementationType = registration.ImplementationType,
                                    CurrentLifetime = registration.Lifetime,
                                    RecommendedLifetime = primaryLifetime,
                                    ConflictReason = "Multiple lifetime registrations found in Minimal API. Consider consolidating to a single lifetime.",
                                    FilePath = registration.FilePath,
                                    LineNumber = registration.LineNumber,
                                    Severity = ConflictSeverity.Medium
                                });
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            LogError("Error analyzing lifetime conflicts", ex);
        }

        return conflicts;
    }

    private int GetLifetimePriority(ServiceScope lifetime)
    {
        return lifetime switch
        {
            ServiceScope.Singleton => 3,
            ServiceScope.Scoped => 2,
            ServiceScope.Transient => 1,
            _ => 0
        };
    }
}