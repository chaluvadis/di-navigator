namespace DIServiceAnalyzer.Services;

public class ProjectAnalyzer : IProjectAnalyzer
{
    public ProjectMetadata AnalyzeProject(string projectPath)
    {
        if (!File.Exists(projectPath))
        {
            throw new FileNotFoundException($"Project file not found: {projectPath}");
        }
        var metadata = new ProjectMetadata();
        try
        {
            var doc = new XmlDocument();
            doc.Load(projectPath);
            // Extract target framework
            var targetFramework = doc.SelectSingleNode("//TargetFramework");
            if (targetFramework != null)
            {
                metadata.TargetFramework = targetFramework.InnerText;
            }
            // Extract output type
            var outputType = doc.SelectSingleNode("//OutputType");
            if (outputType != null)
            {
                metadata.OutputType = outputType.InnerText;
            }
            // Extract package references
            var packageReferences = doc.SelectNodes("//PackageReference");
            if (packageReferences != null)
            {
                foreach (XmlNode packageRef in packageReferences)
                {
                    var include = packageRef.Attributes?["Include"]?.Value;
                    var version = packageRef.Attributes?["Version"]?.Value;
                    if (!string.IsNullOrEmpty(include))
                    {
                        metadata.PackageReferences.Add($"{include} {version}");
                    }
                }
            }
            // Extract project references
            var projectReferences = doc.SelectNodes("//ProjectReference");
            if (projectReferences != null)
            {
                foreach (XmlNode projectRef in projectReferences)
                {
                    var include = projectRef.Attributes?["Include"]?.Value;
                    if (!string.IsNullOrEmpty(include))
                    {
                        metadata.ProjectReferences.Add(include);
                    }
                }
            }
        }
        catch
        {
            throw;
        }
        return metadata;
    }
    public List<string> GetSourceFiles(string projectPath)
    {
        var sourceFiles = new List<string>();
        try
        {
            if (string.IsNullOrEmpty(projectPath))
            {
                return sourceFiles;
            }

            var projectDir = Path.GetDirectoryName(projectPath);
            if (string.IsNullOrEmpty(projectDir))
            {
                return sourceFiles;
            }

            var compileItems = new List<string> { "*.cs" };
            // Check for additional compile patterns in project file
            var doc = new XmlDocument();
            doc.Load(projectPath);
            var compileNodes = doc.SelectNodes("//Compile");
            if (compileNodes != null && compileNodes.Count > 0)
            {
                foreach (XmlNode compileNode in compileNodes)
                {
                    var include = compileNode.Attributes?["Include"]?.Value;
                    if (!string.IsNullOrEmpty(include))
                    {
                        compileItems.Add(include);
                    }
                }
            }
            foreach (var pattern in compileItems)
            {
                var files = Directory.GetFiles(projectDir, pattern, SearchOption.AllDirectories);
                sourceFiles.AddRange(files.Where(f => !f.Contains("\\obj\\") && !f.Contains("\\bin\\")));
            }
        }
        catch
        {
            throw;
        }
        return [.. sourceFiles.Distinct()];
    }
}