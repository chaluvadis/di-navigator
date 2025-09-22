# DI Navigator Test Project

This test project demonstrates various dependency injection patterns that the DI Navigator extension can analyze.

## DI Patterns Included

### Service Registrations
- **Singleton**: `IUserService` registered as singleton
- **Scoped**: `IOrderService` registered as scoped
- **Transient**: `AdminService` registered as transient
- **Factory**: `IUserService` with factory method
- **Complex Factory**: `IOrderService` with complex factory using other services

### Injection Patterns
- **Constructor Injection**: `OrderService` and `AdminService` use constructor injection
- **Service Resolution**: `Program.Main` demonstrates service resolution

### Expected Analysis Results

The DI Navigator should detect:
1. **5 service registrations** with different lifetimes
2. **2 injection sites** (constructor injection)
3. **No conflicts** (all lifetimes are properly configured)
4. **All services properly registered** (no missing registrations)

## Usage

1. Open this project in VS Code
2. The DI Navigator extension should automatically detect it as a .NET project
3. Use the DI Navigator commands to analyze the dependency injection setup
4. Verify that all services are properly detected and analyzed

## Project Structure

- `TestProject.csproj` - .NET project file
- `Program.cs` - Main application with DI setup
- `README.md` - This documentation file