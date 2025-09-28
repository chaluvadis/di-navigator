namespace DIServiceAnalyzer.Services;

public class ServiceLifetimeAnalyzer(ILogger logger) : IServiceLifetimeAnalyzer
{
    private readonly ILogger _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    public List<ServiceLifetimeConflict> AnalyzeLifetimeConflicts(List<ProjectAnalysis> projects)
    {
        var conflicts = new List<ServiceLifetimeConflict>();

        foreach (var project in projects)
        {
            // Group services by interface/implementation
            var serviceGroups = project.ServiceRegistrations
                .GroupBy(sr => new { sr.ServiceType, sr.ImplementationType })
                .ToList();

            foreach (var serviceGroup in serviceGroups)
            {
                var registrations = serviceGroup.ToList();

                // Check for multiple registrations with different lifetimes
                var lifetimeGroups = registrations
                    .GroupBy(r => r.Lifetime)
                    .ToList();

                if (lifetimeGroups.Count > 1)
                {
                    // Multiple lifetimes for same service - potential conflict
                    var orderedLifetimes = lifetimeGroups
                        .OrderBy(lg => GetLifetimePriority(lg.Key))
                        .ToList();

                    var primaryLifetime = orderedLifetimes.First().Key;
                    var conflictingLifetimes = orderedLifetimes.Skip(1);

                    // Add conflicts for ALL non-primary lifetime registrations
                    foreach (var conflictingGroup in conflictingLifetimes)
                    {
                        foreach (var registration in conflictingGroup)
                        {
                            conflicts.Add(new ServiceLifetimeConflict
                            {
                                ServiceType = registration.ServiceType,
                                ImplementationType = registration.ImplementationType,
                                CurrentLifetime = registration.Lifetime,
                                RecommendedLifetime = primaryLifetime,
                                ConflictReason = $"Multiple lifetime registrations found. Consider consolidating to a single lifetime. Primary: {primaryLifetime}, Found: {registration.Lifetime}",
                                FilePath = registration.FilePath,
                                LineNumber = registration.LineNumber,
                                Severity = GetConflictSeverity(registration.Lifetime, primaryLifetime)
                            });
                        }
                    }
                }
                else if (lifetimeGroups.Count == 1)
                {
                    // Single lifetime group - check for other potential issues
                    var lifetimeGroup = lifetimeGroups.First();
                    var lifetime = lifetimeGroup.Key;

                    // Check if Transient services are being overused (potential performance issue)
                    if (lifetime == ServiceScope.Transient && lifetimeGroup.Count() > 10)
                    {
                        foreach (var registration in lifetimeGroup)
                        {
                            conflicts.Add(new ServiceLifetimeConflict
                            {
                                ServiceType = registration.ServiceType,
                                ImplementationType = registration.ImplementationType,
                                CurrentLifetime = registration.Lifetime,
                                RecommendedLifetime = ServiceScope.Scoped,
                                ConflictReason = $"High number of Transient registrations detected ({lifetimeGroup.Count()}). Consider using Scoped for better performance.",
                                FilePath = registration.FilePath,
                                LineNumber = registration.LineNumber,
                                Severity = ConflictSeverity.Low
                            });
                        }
                    }
                }

                // Check for scoped services injected into singletons
                var singletonRegistrations = registrations.Where(r => r.Lifetime == ServiceScope.Singleton);
                var scopedRegistrations = registrations.Where(r => r.Lifetime == ServiceScope.Scoped);
                var transientRegistrations = registrations.Where(r => r.Lifetime == ServiceScope.Transient);

                // Check for scoped services in singletons (captive dependency)
                if (singletonRegistrations.Any() && scopedRegistrations.Any())
                {
                    foreach (var scopedReg in scopedRegistrations)
                    {
                        conflicts.Add(new ServiceLifetimeConflict
                        {
                            ServiceType = scopedReg.ServiceType,
                            ImplementationType = scopedReg.ImplementationType,
                            CurrentLifetime = scopedReg.Lifetime,
                            RecommendedLifetime = ServiceScope.Singleton,
                            ConflictReason = "Scoped service should not be injected into Singleton service (captive dependency)",
                            FilePath = scopedReg.FilePath,
                            LineNumber = scopedReg.LineNumber,
                            Severity = ConflictSeverity.High
                        });
                    }
                }

                // Check for transient services in scoped or singleton (potential performance issue)
                if (singletonRegistrations.Any() && transientRegistrations.Any())
                {
                    foreach (var transientReg in transientRegistrations)
                    {
                        conflicts.Add(new ServiceLifetimeConflict
                        {
                            ServiceType = transientReg.ServiceType,
                            ImplementationType = transientReg.ImplementationType,
                            CurrentLifetime = transientReg.Lifetime,
                            RecommendedLifetime = ServiceScope.Scoped,
                            ConflictReason = "Transient service injected into Singleton. Consider using Scoped for better performance.",
                            FilePath = transientReg.FilePath,
                            LineNumber = transientReg.LineNumber,
                            Severity = ConflictSeverity.Medium
                        });
                    }
                }

                // Check for too many transient registrations (performance anti-pattern)
                if (transientRegistrations.Count() > 5)
                {
                    foreach (var transientReg in transientRegistrations)
                    {
                        conflicts.Add(new ServiceLifetimeConflict
                        {
                            ServiceType = transientReg.ServiceType,
                            ImplementationType = transientReg.ImplementationType,
                            CurrentLifetime = transientReg.Lifetime,
                            RecommendedLifetime = ServiceScope.Scoped,
                            ConflictReason = $"High number of Transient registrations (${transientRegistrations.Count()}). Consider using Scoped for frequently used services.",
                            FilePath = transientReg.FilePath,
                            LineNumber = transientReg.LineNumber,
                            Severity = ConflictSeverity.Low
                        });
                    }
                }

                // Check for Transient services that might be better as Scoped
                // Look for services that are registered once but used in multiple places
                foreach (var transientReg in transientRegistrations)
                {
                    // If a transient service has many injection sites, it might be better as Scoped
                    // Note: Injection sites are tracked at the service level, not registration level
                    // For now, we'll use a heuristic based on the number of registrations
                    if (transientRegistrations.Count() > 3)
                    {
                        conflicts.Add(new ServiceLifetimeConflict
                        {
                            ServiceType = transientReg.ServiceType,
                            ImplementationType = transientReg.ImplementationType,
                            CurrentLifetime = transientReg.Lifetime,
                            RecommendedLifetime = ServiceScope.Scoped,
                            ConflictReason = $"Multiple Transient registrations detected (${transientRegistrations.Count()}). Consider using Scoped for frequently used services.",
                            FilePath = transientReg.FilePath,
                            LineNumber = transientReg.LineNumber,
                            Severity = ConflictSeverity.Medium
                        });
                    }
                }
            }
        }

        return conflicts;
    }

    public List<ServiceDependencyIssue> AnalyzeServiceDependencies(List<ProjectAnalysis> projects)
    {
        var issues = new List<ServiceDependencyIssue>();

        // This would require more complex analysis of the actual dependency graph
        // For now, we'll implement basic checks

        foreach (var project in projects)
        {
            foreach (var registration in project.ServiceRegistrations)
            {
                // Check for potential circular dependencies
                if (HasPotentialCircularDependency(registration, project.ServiceRegistrations))
                {
                    issues.Add(new ServiceDependencyIssue
                    {
                        ServiceType = registration.ServiceType,
                        DependencyType = registration.ImplementationType,
                        IssueDescription = "Potential circular dependency detected",
                        FilePath = registration.FilePath,
                        LineNumber = registration.LineNumber,
                        Severity = IssueSeverity.Warning
                    });
                }
            }
        }

        return issues;
    }

    public List<ServiceLifetimeConflict> AnalyzeMissingRegistrations(List<ProjectAnalysis> projects)
    {
        var conflicts = new List<ServiceLifetimeConflict>();

        foreach (var project in projects)
        {
            // This is a placeholder for missing registration detection
            // In a real implementation, this would analyze constructor injection
            // and compare with available registrations

            // For now, we'll add a method signature for future implementation
            _logger.LogInfo($"Analyzing missing registrations for project: {project.ProjectName}");

            // TODO: Implement missing registration detection
            // - Analyze constructor parameters
            // - Check if services are registered
            // - Identify missing registrations
            // - Suggest appropriate lifetimes
        }

        return conflicts;
    }

    private static int GetLifetimePriority(ServiceScope lifetime) => lifetime switch
    {
        ServiceScope.Transient => 1,
        ServiceScope.Scoped => 2,
        ServiceScope.Singleton => 3,
        _ => 4
    };

    private static ConflictSeverity GetConflictSeverity(ServiceScope current, ServiceScope recommended)
    {
        // High severity conflicts (functional issues)
        if (current == ServiceScope.Scoped && recommended == ServiceScope.Singleton)
            return ConflictSeverity.High; // Captive dependency

        if (current == ServiceScope.Transient && recommended == ServiceScope.Singleton)
            return ConflictSeverity.High; // Performance issue in singleton

        // Medium severity conflicts (performance issues)
        if (current == ServiceScope.Transient && recommended == ServiceScope.Scoped)
            return ConflictSeverity.Medium; // Potential performance issue

        // Low severity conflicts (best practices)
        if (current == ServiceScope.Transient && recommended == ServiceScope.Singleton)
            return ConflictSeverity.Low; // Too many transients

        return ConflictSeverity.Low;
    }

    private static bool HasPotentialCircularDependency(ServiceRegistration registration, List<ServiceRegistration> allRegistrations) =>
        allRegistrations.Any(sr =>
            sr.ServiceType == registration.ImplementationType &&
            sr != registration);
}