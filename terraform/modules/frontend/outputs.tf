output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = aws_lb.oncology_app.dns_name
}

output "load_balancer_zone_id" {
  description = "Zone ID of the load balancer"
  value       = aws_lb.oncology_app.zone_id
}

output "security_group_id" {
  description = "ID of the security group"
  value       = aws_security_group.oncology_app.id
}

output "instance_role_arn" {
  description = "ARN of the EC2 instance role"
  value       = aws_iam_role.ec2_role.arn
}

output "autoscaling_group_name" {
  description = "Name of the Auto Scaling Group"
  value       = aws_autoscaling_group.oncology_app.name
}

# Output the key pair name for reference
output "key_pair_name" {
  description = "Name of the created key pair"
  value       = aws_key_pair.ec2_key_pair.key_name
}

# Output the private key location in SSM
output "private_key_ssm_parameter" {
  description = "SSM parameter containing the private key"
  value       = aws_ssm_parameter.ec2_private_key.name
  sensitive   = true
}
