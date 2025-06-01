output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = module.vpc.public_subnet_ids
}

output "application_url" {
  description = "URL to access the application"
  value       = "http://${module.frontend_ec2.public_ip}:3000"
}

output "ec2_instance_id" {
  description = "ID of the EC2 instance"
  value       = module.frontend_ec2.instance_id
}

output "ec2_public_ip" {
  description = "Public IP of the EC2 instance"
  value       = module.frontend_ec2.public_ip
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group name"
  value       = module.cloudwatch.log_group_name
}

output "security_group_id" {
  description = "Security group ID for the web server"
  value       = module.security_groups.web_security_group_id
}

output "cloudwatch_dashboard_url" {
  description = "URL to access the CloudWatch dashboard"
  value       = module.cloudwatch.dashboard_url
}

# Backend outputs (for when backend is deployed)
output "backend_instance_id" {
  description = "ID of the backend EC2 instance"
  value       = try(module.backend_ec2.instance_id, null)
}

output "backend_private_ip" {
  description = "Private IP of the backend EC2 instance"
  value       = try(module.backend_ec2.private_ip, null)
}

output "backend_api_url" {
  description = "URL to access the backend API (internal)"
  value       = try("http://${module.backend_ec2.private_ip}:8000", null)
}
