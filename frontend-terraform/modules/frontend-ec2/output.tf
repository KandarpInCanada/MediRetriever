output "instance_id" {
  description = "ID of the frontend EC2 instance"
  value       = aws_instance.frontend.id
}

output "public_ip" {
  description = "Public IP address of the frontend EC2 instance"
  value       = aws_eip.frontend.public_ip
}

output "private_ip" {
  description = "Private IP address of the frontend EC2 instance"
  value       = aws_instance.frontend.private_ip
}

output "instance_arn" {
  description = "ARN of the frontend EC2 instance"
  value       = aws_instance.frontend.arn
}
