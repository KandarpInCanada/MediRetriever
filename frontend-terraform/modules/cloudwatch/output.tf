output "log_group_name" {
  description = "Name of the main application log group"
  value       = aws_cloudwatch_log_group.app_logs.name
}

output "log_group_arn" {
  description = "ARN of the main application log group"
  value       = aws_cloudwatch_log_group.app_logs.arn
}

output "system_log_group_name" {
  description = "Name of the system log group"
  value       = aws_cloudwatch_log_group.system_logs.name
}

output "docker_log_group_name" {
  description = "Name of the docker log group"
  value       = aws_cloudwatch_log_group.docker_logs.name
}

output "backend_log_group_name" {
  description = "Name of the backend application log group"
  value       = aws_cloudwatch_log_group.backend_logs.name
}

output "backend_log_group_arn" {
  description = "ARN of the backend application log group"
  value       = aws_cloudwatch_log_group.backend_logs.arn
}

output "dashboard_url" {
  description = "URL of the CloudWatch dashboard"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}
